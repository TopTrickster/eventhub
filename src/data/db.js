// The connection pool and the transaction helper. Every query in the app goes through
// a pool or a client created here, and every value is passed as a $n parameter.
import pg from 'pg';

// count(*) is a bigint, which pg returns as a string; seat counts are far below 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number.parseInt(value, 10));

export function createPool(connectionString, options = {}) {
  return new pg.Pool({ connectionString, max: 10, ...options });
}

/**
 * Runs fn(client) inside BEGIN/COMMIT on one connection, rolling back on any error.
 * Locks taken inside (SELECT ... FOR UPDATE) are held until the commit.
 */
export async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Unique-constraint violation, so a service can turn a race into a 409 instead of a 500. */
export const isUniqueViolation = (error, constraint) =>
  error?.code === '23505' && (constraint === undefined || error.constraint === constraint);

export async function pingDatabase(db) {
  await db.query('SELECT 1');
}
