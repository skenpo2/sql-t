import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

/**
 * A connection Pool keeps a set of reusable connections open instead of
 * opening a brand-new TCP connection for every query. You create ONE pool
 * for the whole app and share it. If DATABASE_URL is set, pg uses it;
 * otherwise it falls back to the PG* environment variables automatically.
 */
export const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : undefined,
);

pool.on('error', (err) => {
  // Fires if an idle client in the pool errors out (e.g. DB restarted).
  console.error('Unexpected PG pool error:', err);
});

/**
 * Small helper so controllers don't import Pool types everywhere.
 * `params` are passed separately from the SQL string — pg turns them into
 * $1, $2, ... bind parameters, which is what prevents SQL injection.
 */
export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}

/**
 * Run several queries as ONE transaction (all-or-nothing) — the "A" in ACID.
 *
 * Why this needs a dedicated client instead of the plain query() helper:
 * BEGIN / COMMIT / ROLLBACK are stateful and must all run on the SAME physical
 * connection. pool.query() grabs a random idle connection each call, so a BEGIN
 * on one and an INSERT on another wouldn't be in the same transaction. So we
 * check ONE client out of the pool, do all the work on it, then release it.
 *
 * Usage:
 *   const order = await withTransaction(async (client) => {
 *     const a = await client.query('INSERT ...');
 *     const b = await client.query('UPDATE ...');
 *     return a.rows[0];
 *   });
 * If the callback throws anywhere, everything rolls back and nothing is saved.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT'); // all statements succeeded -> make it permanent
    return result;
  } catch (err) {
    await client.query('ROLLBACK'); // any failure -> undo the whole thing
    throw err;
  } finally {
    client.release(); // ALWAYS hand the connection back, success or failure
  }
}
