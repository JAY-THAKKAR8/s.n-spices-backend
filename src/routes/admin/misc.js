import { Router } from 'express';
import { z } from 'zod';
import { query, one } from '../../db.js';
import { asyncH, HttpError } from '../../lib/utils.js';
import { validate } from '../../middleware/validate.js';
import { getSettings, saveSettings } from '../../lib/settings.js';

const r = Router();

// ---------- Categories ----------
r.get('/categories', asyncH(async (_req, res) => {
  res.json(await query(
    `SELECT c.*, COUNT(p.id)::int AS product_count FROM categories c
     LEFT JOIN products p ON p.category_id = c.id GROUP BY c.id ORDER BY c.sort_order`,
  ));
}));

// ---------- Coupons ----------
const couponSchema = z.object({
  code: z.string().trim().min(3).max(30).regex(/^[A-Za-z0-9]+$/, 'Code: letters and numbers only').transform((s) => s.toUpperCase()),
  type: z.enum(['PERCENT', 'FLAT']),
  value: z.coerce.number().positive(),
  minOrder: z.coerce.number().min(0).default(0),
  maxOff: z.coerce.number().positive().optional().nullable(),
  validTill: z.coerce.date().optional().nullable(),
  isActive: z.boolean().default(true),
}).refine((c) => c.type !== 'PERCENT' || c.value <= 90, { message: 'Percent off must be 90 or less', path: ['value'] });
const couponVals = (b) => [b.code, b.type, b.value, b.minOrder, b.maxOff ?? null, b.validTill ?? null, b.isActive];

r.get('/coupons', asyncH(async (_req, res) => {
  res.json(await query(
    `SELECT c.*, COUNT(o.id)::int AS used, COALESCE(SUM(o.discount),0) AS discount_given
     FROM coupons c LEFT JOIN orders o ON o.coupon_id = c.id AND o.status <> 'CANCELLED'
     GROUP BY c.id ORDER BY c.id DESC`,
  ));
}));

r.post('/coupons', validate(couponSchema), asyncH(async (req, res) => {
  if (await one('SELECT id FROM coupons WHERE code = $1', [req.body.code])) throw new HttpError(400, 'Code already exists');
  res.status(201).json(await one(
    'INSERT INTO coupons (code, type, value, min_order, max_off, valid_till, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    couponVals(req.body),
  ));
}));

r.put('/coupons/:id', validate(couponSchema), asyncH(async (req, res) => {
  if (await one('SELECT id FROM coupons WHERE code = $1 AND id <> $2', [req.body.code, Number(req.params.id)])) throw new HttpError(400, 'Code already exists');
  const row = await one(
    'UPDATE coupons SET code=$1, type=$2, value=$3, min_order=$4, max_off=$5, valid_till=$6, is_active=$7 WHERE id=$8 RETURNING *',
    [...couponVals(req.body), Number(req.params.id)],
  );
  if (!row) throw new HttpError(404, 'Coupon not found');
  res.json(row);
}));

// ---------- Wholesale (B2B) requests ----------
r.get('/inquiries', asyncH(async (req, res) => {
  const params = [];
  let where = 'TRUE';
  if (['NEW', 'CONTACTED', 'CLOSED'].includes(req.query.status)) { params.push(req.query.status); where = 'status = $1'; }
  res.json(await query(`SELECT * FROM b2b_inquiries WHERE ${where} ORDER BY created_at DESC LIMIT 300`, params));
}));

r.patch('/inquiries/:id', validate(z.object({ status: z.enum(['NEW', 'CONTACTED', 'CLOSED']) })), asyncH(async (req, res) => {
  const row = await one('UPDATE b2b_inquiries SET status = $1 WHERE id = $2 RETURNING *', [req.body.status, Number(req.params.id)]);
  if (!row) throw new HttpError(404, 'Not found');
  res.json(row);
}));

// ---------- Store settings ----------
r.get('/settings', asyncH(async (_req, res) => res.json(await getSettings())));

r.put('/settings', validate(z.object({
  storeName: z.string().trim().min(2).max(80),
  storePhone: z.string().trim().regex(/^91[6-9]\d{9}$/, 'WhatsApp number as 91 + 10 digits, e.g. 919601901832'),
  storeAddress: z.string().trim().max(300),
  storeEmail: z.string().trim().email().or(z.literal('')),
  gstin: z.string().trim().toUpperCase().regex(/^$|^[0-9A-Z]{15}$/, 'GSTIN has 15 letters/numbers'),
  fssai: z.string().trim().regex(/^$|^\d{14}$/, 'FSSAI licence has 14 digits'),
  freeDeliveryMin: z.coerce.number().min(0).max(100000),
  deliveryFee: z.coerce.number().min(0).max(10000),
  defaultLowStock: z.coerce.number().int().min(0).max(10000),
  vipSpend: z.coerce.number().min(0).max(10000000),
}).partial()), asyncH(async (req, res) => {
  res.json(await saveSettings(req.body));
}));

export default r;
