import pg from 'pg';

// NUMERIC comes back as string by default. Make it a JS number (fine for ₹ amounts).
pg.types.setTypeParser(1700, (v: string | null) => (v === null ? null : parseFloat(v)));

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// snake_case row -> camelCase object
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
export const toCamel = (row: Record<string, any> | null): any => {
  if (!row) return row;
  const out: Record<string, any> = {};
  for (const k of Object.keys(row)) out[camel(k)] = row[k];
  return out;
};

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const r = await pool.query(text, params);
  return r.rows.map(toCamel);
}

export async function one<T = any>(text: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}

export interface TxHelpers {
  q: <T = any>(text: string, params?: any[]) => Promise<T[]>;
  one: <T = any>(text: string, params?: any[]) => Promise<T | null>;
}

// Run fn inside BEGIN/COMMIT. fn gets a client with q() and one() helpers.
export async function tx<T>(fn: (db: TxHelpers) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const q = async <R = any>(t: string, p?: any[]) => (await client.query(t, p)).rows.map(toCamel) as R[];
  const o = async <R = any>(t: string, p?: any[]) => (await q<R>(t, p))[0] || null;
  try {
    await client.query('BEGIN');
    const res = await fn({ q, one: o });
    await client.query('COMMIT');
    return res;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
