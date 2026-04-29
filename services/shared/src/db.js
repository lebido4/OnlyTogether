import pg from 'pg';

const { Pool } = pg;

export function createDbPool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30000
  });
}

export async function queryOne(pool, text, params = []) {
  const result = await pool.query(text, params);
  return result.rows[0] ?? null;
}

export async function withTransaction(pool, handler) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const value = await handler(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
