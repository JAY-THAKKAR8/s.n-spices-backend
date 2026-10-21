import { query } from '../db.js';

// Store settings live in the store_settings table. .env gives the first values.
export const SETTING_KEYS = {
  storeName: { env: 'STORE_NAME', def: 'S.N Spices' },
  storePhone: { env: 'STORE_WHATSAPP', def: '919601901832' },
  storeAddress: { env: 'STORE_ADDRESS', def: 'Borsad, Gujarat' },
  storeEmail: { env: 'STORE_EMAIL', def: '' },
  gstin: { env: 'STORE_GSTIN', def: '' },
  fssai: { env: 'STORE_FSSAI', def: '' },
  freeDeliveryMin: { env: 'FREE_DELIVERY_MIN', def: '499', num: true },
  deliveryFee: { env: 'DELIVERY_FEE', def: '40', num: true },
  defaultLowStock: { env: 'DEFAULT_LOW_STOCK', def: '10', num: true },
  vipSpend: { env: 'VIP_SPEND', def: '5000', num: true },
} as const;

let cache: Record<string, any> | null = null;
let cachedAt = 0;

export async function getSettings() {
  if (cache && Date.now() - cachedAt < 30_000) return cache;
  const rows = await query<{ key: string; value: string }>('SELECT key, value FROM store_settings');
  const db = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const out: Record<string, any> = {};
  for (const [k, c] of Object.entries(SETTING_KEYS)) {
    const raw = db[k] ?? process.env[c.env] ?? c.def;
    out[k] = 'num' in c && c.num ? Number(raw) : raw;
  }
  cache = out;
  cachedAt = Date.now();
  return out;
}

export async function saveSettings(patch: Record<string, any>) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in SETTING_KEYS) || v === undefined) continue;
    await query(
      'INSERT INTO store_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
      [k, String(v ?? '')],
    );
  }
  cache = null;
  return getSettings();
}
