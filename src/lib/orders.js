import { query } from '../db.js';

// Load orders with their items. where uses alias o.
export async function loadOrders(where = 'TRUE', params = [], limit = 200) {
  const orders = await query(`SELECT o.* FROM orders o WHERE ${where} ORDER BY o.created_at DESC LIMIT ${Number(limit)}`, params);
  if (!orders.length) return [];
  const items = await query('SELECT * FROM order_items WHERE order_id = ANY($1) ORDER BY id', [orders.map((o) => o.id)]);
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.orderId === o.id) }));
}
