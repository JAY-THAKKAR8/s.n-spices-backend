import { HttpError } from './utils.js';

// Change stock of one pack and log it. Must run inside tx (db = tx helpers).
// change: +n or -n. Fails if stock would go below 0.
export async function moveStock(db, { variantId, change, type, note = null, orderId = null, adminId = null }) {
  const row = await db.one(
    `UPDATE product_variants SET stock = stock + $1, updated_at = now()
     WHERE id = $2 AND stock + $1 >= 0 RETURNING stock`,
    [change, variantId],
  );
  if (!row) return null; // not enough stock (caller decides the error)
  await db.q(
    `INSERT INTO stock_movements (variant_id, change, balance_after, type, note, order_id, admin_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [variantId, change, row.stock, type, note, orderId, adminId],
  );
  return row.stock;
}

// Set stock to an exact number (stock count / edit form).
export async function setStock(db, { variantId, value, type = 'SET', note = null, adminId = null }) {
  const cur = await db.one('SELECT stock FROM product_variants WHERE id = $1 FOR UPDATE', [variantId]);
  if (!cur) throw new HttpError(404, 'Pack not found');
  const change = value - cur.stock;
  if (change === 0) return cur.stock;
  return moveStock(db, { variantId, change, type, note, adminId });
}

export async function addOrderEvent(db, { orderId, kind, status = null, message = null, adminId = null }) {
  await db.q(
    'INSERT INTO order_events (order_id, kind, status, message, admin_id) VALUES ($1,$2,$3,$4,$5)',
    [orderId, kind, status, message, adminId],
  );
}
