import { Router } from 'express';
import { z } from 'zod';
import { query, one, tx } from '../../db.js';
import { asyncH, HttpError } from '../../lib/utils.js';
import { validate } from '../../middleware/validate.js';
import { moveStock, addOrderEvent } from '../../lib/stock.js';
import { getSettings } from '../../lib/settings.js';

const r = Router();

export const STATUSES = ['PENDING', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
const LABEL = {
  PENDING: 'New order', CONFIRMED: 'Confirmed', PACKED: 'Packed',
  OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
};

// Build WHERE for list + export
function orderFilter(qs) {
  const conds = [];
  const params = [];
  const add = (v) => { params.push(v); return `$${params.length}`; };
  if (qs.status && STATUSES.includes(qs.status)) conds.push(`o.status = ${add(qs.status)}`);
  if (qs.payment === 'COD' || qs.payment === 'WHATSAPP') conds.push(`o.payment_method = ${add(qs.payment)}`);
  if (qs.paid === 'PAID' || qs.paid === 'UNPAID') conds.push(`o.payment_status = ${add(qs.paid)}`);
  if (qs.range === 'today') conds.push('o.created_at >= CURRENT_DATE');
  if (qs.range === 'week') conds.push("o.created_at >= CURRENT_DATE - interval '6 days'");
  if (qs.range === 'month') conds.push("o.created_at >= date_trunc('month', now())");
  if (qs.customerId) conds.push(`o.customer_id = ${add(Number(qs.customerId))}`);
  if (qs.q) {
    const p = add(`%${String(qs.q).trim()}%`);
    conds.push(`(o.order_no ILIKE ${p} OR o.phone ILIKE ${p} OR o.name ILIKE ${p} OR o.city ILIKE ${p})`);
  }
  return { where: conds.length ? conds.join(' AND ') : 'TRUE', params };
}

const LIST_SQL = (where, extra = '') => `
  SELECT o.*,
    (SELECT COUNT(*)::int FROM order_items i WHERE i.order_id = o.id) AS line_count,
    (SELECT COALESCE(SUM(i.qty),0)::int FROM order_items i WHERE i.order_id = o.id) AS unit_count,
    (SELECT string_agg(i.name || ' ' || i.pack_size, ', ' ORDER BY i.id) FROM order_items i WHERE i.order_id = o.id) AS items_text
  FROM orders o WHERE ${where} ORDER BY o.created_at DESC ${extra}`;

// List with pagination + counts per status (counts ignore the status filter)
r.get('/', asyncH(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 15));
  const { where, params } = orderFilter(req.query);
  const { where: cw, params: cp } = orderFilter({ ...req.query, status: undefined });

  const [items, total, counts] = await Promise.all([
    query(LIST_SQL(where, `LIMIT ${limit} OFFSET ${(page - 1) * limit}`), params),
    one(`SELECT COUNT(*)::int AS n FROM orders o WHERE ${where}`, params),
    query(`SELECT o.status, COUNT(*)::int AS n FROM orders o WHERE ${cw} GROUP BY o.status`, cp),
  ]);
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  let all = 0;
  for (const c of counts) { byStatus[c.status] = c.n; all += c.n; }
  res.json({ items, total: total.n, page, pages: Math.max(1, Math.ceil(total.n / limit)), counts: { ALL: all, ...byStatus } });
}));

// CSV export (same filters)
r.get('/export.csv', asyncH(async (req, res) => {
  const { where, params } = orderFilter(req.query);
  const rows = await query(LIST_SQL(where, 'LIMIT 5000'), params);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Order No', 'Date', 'Customer', 'Phone', 'City', 'Pincode', 'Items', 'Subtotal', 'Discount', 'Delivery', 'Total', 'Payment', 'Paid', 'Status', 'Courier', 'Tracking'];
  const lines = rows.map((o) => [
    o.orderNo, new Date(o.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), o.name, o.phone, o.city, o.pincode,
    o.itemsText, o.subtotal, o.discount, o.deliveryFee, o.total, o.paymentMethod, o.paymentStatus, LABEL[o.status], o.courier, o.trackingNo,
  ].map(esc).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sn-orders-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + [head.join(','), ...lines].join('\n'));
}));

// Full order: items (with product photo + category), timeline, customer summary, seller info for invoice
r.get('/:id', asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const o = await one('SELECT * FROM orders WHERE id = $1', [id]);
  if (!o) throw new HttpError(404, 'Order not found');
  const [items, events, cust, coupon, settings] = await Promise.all([
    query(`SELECT i.*, v.sku, v.grams, p.id AS product_id, p.slug, p.image, p.hsn_code, p.gst_rate, c.name_en AS category, c.slug AS category_slug
           FROM order_items i
           JOIN product_variants v ON v.id = i.variant_id
           JOIN products p ON p.id = v.product_id
           JOIN categories c ON c.id = p.category_id
           WHERE i.order_id = $1 ORDER BY i.id`, [id]),
    query(`SELECT e.*, a.name AS admin_name FROM order_events e LEFT JOIN admins a ON a.id = e.admin_id
           WHERE e.order_id = $1 ORDER BY e.created_at, e.id`, [id]),
    one(`SELECT c.id, c.name, c.phone, c.email, c.note, c.created_at,
           COUNT(x.id) FILTER (WHERE x.status <> 'CANCELLED')::int AS order_count,
           COALESCE(SUM(x.total) FILTER (WHERE x.status <> 'CANCELLED'), 0) AS total_spent
         FROM customers c LEFT JOIN orders x ON x.customer_id = c.id
         WHERE c.id = $1 GROUP BY c.id`, [o.customerId]),
    o.couponId ? one('SELECT code, type, value FROM coupons WHERE id = $1', [o.couponId]) : null,
    getSettings(),
  ]);
  const position = await one(
    `SELECT COUNT(*)::int AS n FROM orders WHERE customer_id = $1 AND created_at <= $2 AND status <> 'CANCELLED'`,
    [o.customerId, o.createdAt],
  );
  const weight = items.reduce((g, i) => g + (i.grams || 0) * i.qty, 0);
  res.json({
    ...o,
    items,
    events,
    customer: { ...cust, orderPosition: position.n },
    coupon,
    weightGrams: weight,
    seller: { name: settings.storeName, address: settings.storeAddress, phone: settings.storePhone, gstin: settings.gstin, fssai: settings.fssai, email: settings.storeEmail },
  });
}));

// Change status / payment / courier
const patchBody = z.object({
  status: z.enum(STATUSES).optional(),
  paymentStatus: z.enum(['UNPAID', 'PAID', 'REFUNDED']).optional(),
  courier: z.string().trim().max(60).optional().nullable(),
  trackingNo: z.string().trim().max(60).optional().nullable(),
  note: z.string().trim().max(300).optional(),
});

r.patch('/:id', validate(patchBody), asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const adminId = req.admin.id;
  const b = req.body;
  await tx(async (db) => {
    const old = await db.one('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
    if (!old) throw new HttpError(404, 'Order not found');

    if (b.status && b.status !== old.status) {
      if (old.status === 'CANCELLED') throw new HttpError(400, 'Cancelled order cannot be reopened. Place a new order.');
      if (old.status === 'DELIVERED' && b.status !== 'CANCELLED') throw new HttpError(400, 'Order is already delivered.');
      if (b.status === 'CANCELLED') {
        const items = await db.q('SELECT variant_id, qty FROM order_items WHERE order_id = $1', [id]);
        for (const it of items) {
          await moveStock(db, { variantId: it.variantId, change: it.qty, type: 'CANCEL', orderId: id, adminId, note: `${old.orderNo} cancelled` });
        }
      }
      await db.q('UPDATE orders SET status = $2, updated_at = now() WHERE id = $1', [id, b.status]);
      await addOrderEvent(db, { orderId: id, kind: 'STATUS', status: b.status, message: b.note || null, adminId });
      // cash collected on delivery
      if (b.status === 'DELIVERED' && old.paymentMethod === 'COD' && old.paymentStatus === 'UNPAID' && !b.paymentStatus) {
        await db.q("UPDATE orders SET payment_status = 'PAID' WHERE id = $1", [id]);
        await addOrderEvent(db, { orderId: id, kind: 'PAYMENT', status: 'PAID', message: 'Cash collected on delivery', adminId });
      }
    }
    if (b.paymentStatus && b.paymentStatus !== old.paymentStatus) {
      await db.q('UPDATE orders SET payment_status = $2, updated_at = now() WHERE id = $1', [id, b.paymentStatus]);
      await addOrderEvent(db, { orderId: id, kind: 'PAYMENT', status: b.paymentStatus, message: b.note || null, adminId });
    }
    if (b.courier !== undefined || b.trackingNo !== undefined) {
      const courier = b.courier === undefined ? old.courier : b.courier || null;
      const tracking = b.trackingNo === undefined ? old.trackingNo : b.trackingNo || null;
      if (courier !== old.courier || tracking !== old.trackingNo) {
        await db.q('UPDATE orders SET courier = $2, tracking_no = $3, updated_at = now() WHERE id = $1', [id, courier, tracking]);
        await addOrderEvent(db, { orderId: id, kind: 'SHIPPING', message: [courier, tracking].filter(Boolean).join(' • ') || 'Shipping info removed', adminId });
      }
    }
  });
  res.json(await one('SELECT * FROM orders WHERE id = $1', [id]));
}));

// Internal note (staff only)
r.post('/:id/notes', validate(z.object({ message: z.string().trim().min(1).max(500) })), asyncH(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await one('SELECT id FROM orders WHERE id = $1', [id]))) throw new HttpError(404, 'Order not found');
  const e = await one(
    `INSERT INTO order_events (order_id, kind, message, admin_id) VALUES ($1, 'NOTE', $2, $3) RETURNING *`,
    [id, req.body.message, req.admin.id],
  );
  res.status(201).json({ ...e, adminName: req.admin.name });
}));

export default r;
