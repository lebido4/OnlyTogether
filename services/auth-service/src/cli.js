import bcrypt from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AppError,
  createDbPool,
  createLogger,
  createRedisConnection,
  requireString,
  runMigrations,
  validateEmail
} from '@onlytogether/shared';

const logger = createLogger('auth-service-admin');
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const defaultMigrationsDir = path.resolve(currentDir, '../../../database/migrations');

function parseArgs(args) {
  const flags = {};
  const positionals = [];

  for (const arg of args) {
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const [rawKey, ...rawValue] = arg.slice(2).split('=');
    const key = rawKey.trim();
    flags[key] = rawValue.length > 0 ? rawValue.join('=') : true;
  }

  return { flags, positionals };
}

function printHelp() {
  process.stdout.write(`OnlyTogether admin commands

Usage:
  server
  migrate [--dir=database/migrations]
  create-admin --email=admin@example.com [--username=admin] [--password=secret]
  clear-cache [--pattern=presence:*]
  clear-cache --all

Environment:
  DATABASE_URL       Required for migrate/create-admin
  REDIS_URL          Required for clear-cache
  ADMIN_PASSWORD     Password fallback for create-admin
`);
}

async function withDb(handler) {
  const db = createDbPool();
  try {
    return await handler(db);
  } finally {
    await db.end();
  }
}

async function commandMigrate(flags) {
  const migrationsDir = path.resolve(String(flags.dir ?? defaultMigrationsDir));
  await withDb((db) => runMigrations(db, { migrationsDir, logger }));
}

async function commandCreateAdmin(flags) {
  const email = validateEmail(String(flags.email ?? ''));
  const username = requireString(
    { username: flags.username ?? email.split('@')[0] },
    'username',
    { min: 2, max: 40 }
  );
  const password = requireString(
    { password: flags.password ?? process.env.ADMIN_PASSWORD },
    'password',
    { min: 8, max: 128 }
  );
  const passwordHash = await bcrypt.hash(password, 12);

  await withDb(async (db) => {
    try {
      const user = (
        await db.query(
          `INSERT INTO users (email, username, password_hash, is_admin)
           VALUES ($1, $2, $3, TRUE)
           ON CONFLICT (email)
           DO UPDATE SET
             username = EXCLUDED.username,
             password_hash = EXCLUDED.password_hash,
             is_admin = TRUE,
             updated_at = NOW()
           RETURNING id, email, username, is_admin, created_at`,
          [email, username, passwordHash]
        )
      ).rows[0];

      logger.info(
        {
          userId: user.id,
          email: user.email,
          username: user.username,
          isAdmin: user.is_admin
        },
        'Admin user created or updated'
      );
    } catch (error) {
      if (error.code === '23505') {
        throw new AppError(
          409,
          'ADMIN_USERNAME_CONFLICT',
          'Another user already has this username'
        );
      }

      throw error;
    }
  });
}

async function deleteKeys(redis, keys) {
  if (keys.length === 0) {
    return 0;
  }

  return redis.del(keys);
}

async function commandClearCache(flags) {
  const redis = await createRedisConnection(logger);
  try {
    if (flags.all) {
      await redis.flushDb();
      logger.info({ mode: 'all' }, 'Redis cache cleared');
      return;
    }

    const pattern = String(flags.pattern ?? process.env.CACHE_CLEAR_PATTERN ?? 'presence:*');
    let deletedCount = 0;
    let batch = [];

    for await (const key of redis.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      batch.push(key);
      if (batch.length >= 100) {
        deletedCount += await deleteKeys(redis, batch);
        batch = [];
      }
    }

    deletedCount += await deleteKeys(redis, batch);
    logger.info({ pattern, deletedCount }, 'Redis cache keys cleared');
  } finally {
    if (redis.isOpen) {
      await redis.quit();
    }
  }
}

async function main() {
  const [command = 'server', ...args] = process.argv.slice(2);
  const { flags } = parseArgs(args);

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'server') {
    await import('./server.js');
    return;
  }

  if (command === 'migrate') {
    await commandMigrate(flags);
    return;
  }

  if (command === 'create-admin') {
    await commandCreateAdmin(flags);
    return;
  }

  if (command === 'clear-cache') {
    await commandClearCache(flags);
    return;
  }

  throw new AppError(400, 'UNKNOWN_ADMIN_COMMAND', `Unknown admin command: ${command}`);
}

main().catch((error) => {
  logger.error({ error }, 'Admin command failed');
  process.exitCode = 1;
});
