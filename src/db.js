import pg from 'pg';

// NUMERIC comes back as string by default. Make it a JS number (fine for ₹ amounts).
pg.types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v)));

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// snake_case row -> camelCase object
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
export const toCamel = (row) => {
  if (!row) return row;
  const out = {};
  for (const k of Object.keys(row)) out[camel(k)] = row[k];
  return out;
};

export async function query(text, params) {
  const r = await pool.query(text, params);
  return r.rows.map(toCamel);
}

export async function one(text, params) {
  const rows = await query(text, params);
  return rows[0] || null;
}

// Run fn inside BEGIN/COMMIT. fn gets a client with q() and one() helpers.
export async function tx(fn) {
  const client = await pool.connect();
  const q = async (t, p) => (await client.query(t, p)).rows.map(toCamel);
  const o = async (t, p) => (await q(t, p))[0] || null;
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
