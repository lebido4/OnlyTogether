import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const MIGRATION_LOCK_ID = 20260505;

function checksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function parseMigrationFile(fileName) {
  const match = fileName.match(/^(\d+)_(.+)\.sql$/);
  if (!match) {
    return null;
  }

  return {
    version: match[1],
    name: match[2].replaceAll('_', ' '),
    fileName
  };
}

async function readMigrations(migrationsDir) {
  const files = await fs.readdir(migrationsDir);
  const migrations = files
    .map(parseMigrationFile)
    .filter(Boolean)
    .sort((left, right) => left.version.localeCompare(right.version));

  return Promise.all(
    migrations.map(async (migration) => {
      const filePath = path.join(migrationsDir, migration.fileName);
      const sql = await fs.readFile(filePath, 'utf8');
      return {
        ...migration,
        checksum: checksum(sql),
        sql
      };
    })
  );
}

export async function runMigrations(pool, { migrationsDir, logger }) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedRows = (
      await client.query('SELECT version, checksum FROM schema_migrations ORDER BY version')
    ).rows;
    const applied = new Map(appliedRows.map((row) => [row.version, row.checksum]));
    const migrations = await readMigrations(migrationsDir);
    let appliedCount = 0;

    for (const migration of migrations) {
      const appliedChecksum = applied.get(migration.version);
      if (appliedChecksum) {
        if (appliedChecksum !== migration.checksum) {
          throw new Error(`Migration ${migration.fileName} checksum mismatch`);
        }

        logger.info(
          { migration: migration.fileName, version: migration.version },
          'Migration already applied'
        );
        continue;
      }

      logger.info({ migration: migration.fileName, version: migration.version }, 'Migration applying');
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)',
          [migration.version, migration.name, migration.checksum]
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }

      appliedCount += 1;
      logger.info({ migration: migration.fileName, version: migration.version }, 'Migration applied');
    }

    logger.info({ appliedCount, totalCount: migrations.length }, 'Migrations completed');
    return { appliedCount, totalCount: migrations.length };
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    } finally {
      client.release();
    }
  }
}
