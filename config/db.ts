import { Pool, type QueryResultRow } from 'pg';
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
