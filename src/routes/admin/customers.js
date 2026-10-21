import { Router } from 'express';
import { z } from 'zod';
import { query, one } from '../../db.js';
import { asyncH, HttpError } from '../../lib/utils.js';
import { validate } from '../../middleware/validate.js';
import { getSettings } from '../../lib/settings.js';

const r = Router();

// One row per customer with order stats (cancelled orders not counted)
const BASE = `
  WITH stats AS (
    SELECT c.id, c.name, c.phone, c.email, c.note, c.created_at,
      COUNT(o.id) FILTER (WHERE o.status <> 'CANCELLED')::int AS order_count,
      COALESCE(SUM(o.total) FILTER (WHERE o.status <> 'CANCELLED'), 0) AS total_spent,
      MAX(o.created_at) AS last_order_at,
      (ARRAY_AGG(o.order_no ORDER BY o.created_at DESC))[1] AS last_order_no,
      (ARRAY_AGG(o.id ORDER BY o.created_at DESC))[1] AS last_order_id,
      (ARRAY_AGG(o.city ORDER BY o.created_at DESC))[1] AS city,
      (ARRAY_AGG(o.pincode ORDER BY o.created_at DESC))[1] AS pincode
    FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
    GROUP BY c.id
  )`;

const SORTS = {
  spent_desc: 'total_spent DESC, id DESC',
  spent_asc: 'total_spent ASC, id DESC',
  recent: 'last_order_at DESC NULLS LAST, id DESC',
  orders_desc: 'order_count DESC, total_spent DESC',
  name: 'name ASC',
  newest: 'created_at DESC',
};

function filters(qs, vip) {
  const conds = [];
  const params = [];
  const add = (v) => { params.push(v); return `$${params.length}`; };
  if (qs.q) {
    const p = add(`%${String(qs.q).trim()}%`);
    conds.push(`(name ILIKE ${p} OR phone ILIKE ${p} OR email ILIKE ${p} OR city ILIKE ${p})`);
  }
  if (qs.city) conds.push(`city ILIKE ${add(qs.city)}`);
  if (qs.segment === 'repeat') conds.push('order_count >= 2');
  if (qs.segment === 'first') conds.push('order_count = 1');
  if (qs.segment === 'vip') conds.push(`total_spent >= ${add(vip)}`);
  if (qs.segment === 'inactive') conds.push("last_order_at < now() - interval '90 days'");
  if (qs.segment === 'none') conds.push('order_count = 0');
  return { where: conds.length ? conds.join(' AND ') : 'TRUE', params };
}

r.get('/', asyncH(async (req, res) => {
  const { vipSpend } = await getSettings();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 15));
  const sort = SORTS[req.query.sort] || SORTS.spent_desc;
  const { where, params } = filters(req.query, vipSpend);

  const [items, total, kpis, segs, cities] = await Promise.all([
    query(`${BASE} SELECT * FROM stats WHERE ${where} ORDER BY ${sort} LIMIT ${limit} OFFSET ${(page - 1) * limit}`, params),
    one(`${BASE} SELECT COUNT(*)::int AS n FROM stats WHERE ${where}`, params),
    one(`${BASE} SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))::int AS new_month,
        COUNT(*) FILTER (WHERE order_count >= 2)::int AS repeat,
        COUNT(*) FILTER (WHERE order_count >= 1)::int AS buyers,
        COALESCE(SUM(total_spent) / NULLIF(SUM(order_count), 0), 0) AS aov
      FROM stats`),
    one(`${BASE} SELECT
        COUNT(*)::int AS all,
        COUNT(*) FILTER (WHERE order_count >= 2)::int AS repeat,
        COUNT(*) FILTER (WHERE total_spent >= $1)::int AS vip,
        COUNT(*) FILTER (WHERE order_count = 1)::int AS first,
        COUNT(*) FILTER (WHERE last_order_at < now() - interval '90 days')::int AS inactive
      FROM stats`, [vipSpend]),
    query(`SELECT city, COUNT(DISTINCT customer_id)::int AS n FROM orders GROUP BY city ORDER BY n DESC LIMIT 20`),
  ]);
  res.json({ items, total: total.n, page, pages: Math.max(1, Math.ceil(total.n / limit)), kpis, segments: segs, cities, vipSpend });
}));

r.get('/export.csv', asyncH(async (req, res) => {
  const { vipSpend } = await getSettings();
  const { where, params } = filters(req.query, vipSpend);
  const rows = await query(`${BASE} SELECT * FROM stats WHERE ${where} ORDER BY total_spent DESC LIMIT 10000`, params);
  const esc = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
  const head = ['Name', 'Phone', 'Email', 'City', 'Pincode', 'Orders', 'Total spent', 'Last order', 'Last order date', 'Customer since'];
  const d = (x) => (x ? new Date(x).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '');
  const body = rows.map((c) => [c.name, c.phone, c.email, c.city, c.pincode, c.orderCount, c.totalSpent, c.lastOrderNo, d(c.lastOrderAt), d(c.createdAt)].map(esc).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sn-customers-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + [head.join(','), ...body].join('\n'));
}));

r.get('/:id', asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const c = await one(`${BASE} SELECT * FROM stats WHERE id = $1`, [id]);
  if (!c) throw new HttpError(404, 'Customer not found');
  const [orders, favourites] = await Promise.all([
    query(`SELECT id, order_no, total, status, payment_status, payment_method, created_at, address, city, pincode,
             (SELECT COUNT(*)::int FROM order_items i WHERE i.order_id = o.id) AS line_count
           FROM orders o WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50`, [id]),
    query(`SELECT i.name, SUM(i.qty)::int AS qty FROM order_items i JOIN orders o ON o.id = i.order_id
           WHERE o.customer_id = $1 AND o.status <> 'CANCELLED' GROUP BY i.name ORDER BY qty DESC LIMIT 5`, [id]),
  ]);
  res.json({ ...c, orders, favourites, lastAddress: orders[0] ? `${orders[0].address}, ${orders[0].city} - ${orders[0].pincode}` : null });
}));

const custBody = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter 10 digit mobile number'),
  email: z.string().trim().email().max(120).optional().nullable().or(z.literal('')),
  note: z.string().trim().max(300).optional().nullable(),
});

r.post('/', validate(custBody), asyncH(async (req, res) => {
  const b = req.body;
  if (await one('SELECT id FROM customers WHERE phone = $1', [b.phone])) throw new HttpError(400, 'A customer with this phone already exists');
  res.status(201).json(await one(
    'INSERT INTO customers (name, phone, email, note) VALUES ($1,$2,$3,$4) RETURNING *',
    [b.name, b.phone, b.email || null, b.note || null],
  ));
}));

r.put('/:id', validate(custBody), asyncH(async (req, res) => {
  const b = req.body;
  const id = Number(req.params.id);
  if (await one('SELECT id FROM customers WHERE phone = $1 AND id <> $2', [b.phone, id])) throw new HttpError(400, 'Another customer has this phone');
  const row = await one('UPDATE customers SET name=$1, phone=$2, email=$3, note=$4 WHERE id=$5 RETURNING *', [b.name, b.phone, b.email || null, b.note || null, id]);
  if (!row) throw new HttpError(404, 'Customer not found');
  res.json(row);
}));

export default r;
