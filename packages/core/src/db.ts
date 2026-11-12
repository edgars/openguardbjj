import pg from 'pg';
import type { PoolClient, QueryResultRow } from 'pg';

const { Pool } = pg;

// numeric -> number (duration_seconds, timestamps). bigint -> number (tamanhos < 2^53).
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

declare global {
  // eslint-disable-next-line no-var
  var __bjjPool: pg.Pool | undefined;
}

type PoolListener = (pool: pg.Pool) => void;
let onCreate: PoolListener | undefined;

/** Permite que o app web registre attachDatabasePool (Vercel Fluid Compute). */
export function onPoolCreated(listener: PoolListener) {
  onCreate = listener;
  if (globalThis.__bjjPool) listener(globalThis.__bjjPool);
}

export function getPool(): pg.Pool {
  if (!globalThis.__bjjPool) {
    const raw = process.env.DATABASE_URL;
    if (!raw) throw new Error('DATABASE_URL não configurada');
    // pg 8 já trata sslmode=require como verify-full; explicitar mantém a verificação de certificado e remove o aviso.
    const connectionString = raw.replace(/sslmode=require\b/, 'sslmode=verify-full');
    globalThis.__bjjPool = new Pool({
      connectionString,
      max: Number(process.env.PG_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
    });
    onCreate?.(globalThis.__bjjPool);
  }
  return globalThis.__bjjPool;
}

export async function query<T extends QueryResultRow = Record<string, any>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await getPool().query<T>(text, params as any[]);
  return res.rows;
}

export async function queryOne<T extends QueryResultRow = Record<string, any>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
