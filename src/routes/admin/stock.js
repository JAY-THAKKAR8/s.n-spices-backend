import { Router } from 'express';
import { z } from 'zod';
import { query, one, tx } from '../../db.js';
import { asyncH, HttpError } from '../../lib/utils.js';
import { validate } from '../../middleware/validate.js';
import { moveStock, setStock } from '../../lib/stock.js';

const r = Router();

// One row per pack. state: all | low | out
r.get('/', asyncH(async (req, res) => {
  // live packs; hidden products still show while they hold stock
  const conds = ['v.is_active AND (p.is_active OR v.stock > 0)'];
  const params = [];
  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    conds.push(`(p.name_en ILIKE $${params.length} OR v.sku ILIKE $${params.length})`);
  }
  if (req.query.state === 'low') conds.push('v.stock > 0 AND v.stock <= v.low_stock_threshold');
  if (req.query.state === 'out') conds.push('v.stock = 0');
  const items = await query(
    `SELECT v.id, v.sku, v.pack_size, v.grams, v.stock, v.low_stock_threshold, v.price, v.cost_price, v.is_active, v.updated_at,
       p.id AS product_id, p.name_en AS product, p.image, p.is_active AS product_active, c.name_en AS category, c.slug AS category_slug,
       (SELECT MAX(m.created_at) FROM stock_movements m WHERE m.variant_id = v.id) AS last_move_at
     FROM product_variants v JOIN products p ON p.id = v.product_id JOIN categories c ON c.id = p.category_id
     WHERE (${conds[0]}) ${conds.slice(1).map((c) => `AND ${c}`).join(' ')}
     ORDER BY (v.stock = 0) DESC, (v.stock <= v.low_stock_threshold) DESC, p.name_en, v.grams`,
    params,
  );
  const k = await one(`SELECT
      COALESCE(SUM(v.stock),0)::int AS units,
      COUNT(*) FILTER (WHERE v.stock > 0 AND v.stock <= v.low_stock_threshold)::int AS low,
      COUNT(*) FILTER (WHERE v.stock = 0)::int AS out,
      COUNT(*)::int AS packs,
      COALESCE(SUM(v.stock * v.price),0) AS retail_value,
      COALESCE(SUM(v.stock * v.cost_price),0) AS cost_value
    FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.is_active AND p.is_active`);
  res.json({ items, kpis: k });
}));

// Stock change log
r.get('/movements', asyncH(async (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 20);
  const params = [];
  let where = 'TRUE';
  if (req.query.variantId) { params.push(Number(req.query.variantId)); where = `m.variant_id = $1`; }
  res.json(await query(
    `SELECT m.*, v.pack_size, v.sku, p.name_en AS product, a.name AS admin_name, o.order_no
     FROM stock_movements m
     JOIN product_variants v ON v.id = m.variant_id JOIN products p ON p.id = v.product_id
     LEFT JOIN admins a ON a.id = m.admin_id LEFT JOIN orders o ON o.id = m.order_id
     WHERE ${where} ORDER BY m.created_at DESC, m.id DESC LIMIT ${limit}`,
    params,
  ));
}));

// Add / deduct / set stock for a pack
const adjustBody = z.object({
  variantId: z.number().int(),
  action: z.enum(['ADD', 'DEDUCT', 'SET']),
  qty: z.coerce.number().int().min(0).max(100000),
  note: z.string().trim().max(200).optional().nullable(),
  lowStockThreshold: z.coerce.number().int().min(0).max(100000).optional(),
});

r.post('/adjust', validate(adjustBody), asyncH(async (req, res) => {
  const b = req.body;
  if (b.action !== 'SET' && b.qty === 0) throw new HttpError(400, 'Enter quantity more than 0');
  const result = await tx(async (db) => {
    const v = await db.one('SELECT id, stock FROM product_variants WHERE id = $1 FOR UPDATE', [b.variantId]);
    if (!v) throw new HttpError(404, 'Pack not found');
    let left;
    if (b.action === 'SET') left = await setStock(db, { variantId: v.id, value: b.qty, type: 'SET', note: b.note || 'Stock count', adminId: req.admin.id });
    else {
      left = await moveStock(db, {
        variantId: v.id,
        change: b.action === 'ADD' ? b.qty : -b.qty,
        type: b.action === 'ADD' ? 'INWARD' : 'DEDUCT',
        note: b.note || null,
        adminId: req.admin.id,
      });
      if (left === null) throw new HttpError(400, `Only ${v.stock} in stock. Cannot remove ${b.qty}.`);
    }
    if (b.lowStockThreshold !== undefined) {
      await db.q('UPDATE product_variants SET low_stock_threshold = $1, updated_at = now() WHERE id = $2', [b.lowStockThreshold, v.id]);
    }
    return { variantId: v.id, stock: left };
  });
  res.json(result);
}));

// CSV stock sheet
r.get('/export.csv', asyncH(async (_req, res) => {
  const rows = await query(
    `SELECT p.name_en, v.pack_size, v.sku, c.name_en AS category, v.stock, v.low_stock_threshold, v.price, v.cost_price
     FROM product_variants v JOIN products p ON p.id = v.product_id JOIN categories c ON c.id = p.category_id
     WHERE v.is_active ORDER BY p.name_en, v.grams`,
  );
  const esc = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
  const head = ['Product', 'Pack', 'SKU', 'Category', 'Stock', 'Alert below', 'Price', 'Cost'];
  const body = rows.map((x) => [x.nameEn, x.packSize, x.sku, x.category, x.stock, x.lowStockThreshold, x.price, x.costPrice].map(esc).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sn-stock-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + [head.join(','), ...body].join('\n'));
}));

export default r;
