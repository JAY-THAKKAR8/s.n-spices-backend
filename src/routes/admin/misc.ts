import { Router } from 'express';
import { z } from 'zod';
import { Category, Product, Coupon, B2bInquiry } from '../../models/index.js';
import { asyncH, HttpError } from '../../lib/utils.js';
import { validate } from '../../middleware/validate.js';
import { getSettings, saveSettings } from '../../lib/settings.js';
import { nextId } from '../../db.js';

const r = Router();

// ---------- Categories ----------
r.get('/categories', asyncH(async (_req, res) => {
  const [cats, counts] = await Promise.all([
    Category.find().sort({ sortOrder: 1 }).lean(),
    Product.aggregate([{ $group: { _id: '$categoryId', n: { $sum: 1 } } }]),
  ]);
  const countById = new Map(counts.map((c) => [c._id, c.n]));
  res.json(cats.map((c) => ({ ...c, productCount: countById.get(c.id) || 0 })));
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
const couponSet = (b: any) => ({ code: b.code, type: b.type, value: b.value, minOrder: b.minOrder, maxOff: b.maxOff ?? null, validTill: b.validTill ?? null, isActive: b.isActive });

r.get('/coupons', asyncH(async (_req, res) => {
  const rows = await Coupon.aggregate([
    { $lookup: {
      from: 'orders', let: { cid: '$id' },
      pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$couponId', '$$cid'] }, { $ne: ['$status', 'CANCELLED'] }] } } }],
      as: 'orders',
    } },
    { $addFields: { used: { $size: '$orders' }, discountGiven: { $sum: '$orders.discount' } } },
    { $project: { orders: 0 } },
    { $sort: { id: -1 } },
  ]);
  res.json(rows);
}));

r.post('/coupons', validate(couponSchema), asyncH(async (req, res) => {
  if (await Coupon.exists({ code: req.body.code })) throw new HttpError(400, 'Code already exists');
  const id = await nextId('coupon');
  res.status(201).json(await Coupon.create({ id, ...couponSet(req.body) }));
}));

r.put('/coupons/:id', validate(couponSchema), asyncH(async (req, res) => {
  const id = Number(req.params.id);
  if (await Coupon.exists({ code: req.body.code, id: { $ne: id } })) throw new HttpError(400, 'Code already exists');
  const row = await Coupon.findOneAndUpdate({ id }, { $set: couponSet(req.body) }, { new: true });
  if (!row) throw new HttpError(404, 'Coupon not found');
  res.json(row);
}));

// ---------- Wholesale (B2B) requests ----------
r.get('/inquiries', asyncH(async (req, res) => {
  const filter: Record<string, any> = {};
  if (['NEW', 'CONTACTED', 'CLOSED'].includes(req.query.status as string)) filter.status = req.query.status;
  res.json(await B2bInquiry.find(filter).sort({ createdAt: -1 }).limit(300).lean());
}));

r.patch('/inquiries/:id', validate(z.object({ status: z.enum(['NEW', 'CONTACTED', 'CLOSED']) })), asyncH(async (req, res) => {
  const row = await B2bInquiry.findOneAndUpdate({ id: Number(req.params.id) }, { $set: { status: req.body.status } }, { new: true });
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
