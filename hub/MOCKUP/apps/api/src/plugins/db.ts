import { Pool, PoolClient, QueryResultRow } from 'pg';
import { env } from '../config/env.js';

export const dbPool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

dbPool.on('error', (err) => {
  console.error('[pg pool error]', err.message);
});

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
) {
  return dbPool.query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Executa consulta usando o contexto real de RLS do Supabase (authenticated + request.jwt.claim.sub)
 * Útil tanto em endpoints críticos quanto nos testes de isolamento multiunidade no banco.
 */
export async function withRlsUserContext<T>(
  authUserId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  return withTransaction(async (client) => {
    await client.query(`SET LOCAL ROLE authenticated`);
    await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [authUserId]);
    await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
    return fn(client);
  });
}

export async function checkDbHealth(): Promise<boolean> {
  try {
    await dbPool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
