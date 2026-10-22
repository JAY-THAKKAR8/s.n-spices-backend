import { Router } from 'express';
import { z } from 'zod';
import { Product, StockMovement, Order, Admin } from '../../models/index.js';
import type { ProductDoc, OrderDoc, AdminDoc } from '../../models/index.js';
import { asyncH, HttpError } from '../../lib/utils.js';
import { validate } from '../../middleware/validate.js';
import { moveStock, setStock } from '../../lib/stock.js';
import { tx } from '../../db.js';

const r = Router();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One row per pack. state: all | low | out
r.get('/', asyncH(async (req, res) => {
  const pipeline: any[] = [
    { $unwind: '$variants' },
    // live packs; hidden products still show while they hold stock
    { $match: { $expr: { $and: [
      { $eq: ['$variants.isActive', true] },
      { $or: [{ $eq: ['$isActive', true] }, { $gt: ['$variants.stock', 0] }] },
    ] } } },
  ];
  if (req.query.q) {
    const re = new RegExp(escapeRe(String(req.query.q)), 'i');
    pipeline.push({ $match: { $or: [{ nameEn: re }, { 'variants.sku': re }] } });
  }
  if (req.query.state === 'low') {
    pipeline.push({ $match: { $expr: { $and: [{ $gt: ['$variants.stock', 0] }, { $lte: ['$variants.stock', '$variants.lowStockThreshold'] }] } } });
  }
  if (req.query.state === 'out') pipeline.push({ $match: { 'variants.stock': 0 } });
  pipeline.push(
    { $lookup: { from: 'categories', localField: 'categoryId', foreignField: 'id', as: 'cat' } },
    { $project: {
      _id: 0, id: '$variants.id', sku: '$variants.sku', packSize: '$variants.packSize', grams: '$variants.grams',
      stock: '$variants.stock', lowStockThreshold: '$variants.lowStockThreshold', price: '$variants.price', costPrice: '$variants.costPrice',
      isActive: '$variants.isActive', updatedAt: '$variants.updatedAt',
      productId: '$id', product: '$nameEn', image: '$image', productActive: '$isActive',
      category: { $arrayElemAt: ['$cat.nameEn', 0] }, categorySlug: { $arrayElemAt: ['$cat.slug', 0] },
    } },
    { $addFields: {
      isLow: { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$lowStockThreshold'] }] },
      isOut: { $eq: ['$stock', 0] },
    } },
    { $sort: { isOut: -1, isLow: -1, product: 1, grams: 1 } },
  );
  const items = await Product.aggregate(pipeline);

  const variantIds = items.map((i) => i.id);
  const moves = await StockMovement.aggregate([
    { $match: { variantId: { $in: variantIds } } },
    { $group: { _id: '$variantId', last: { $max: '$createdAt' } } },
  ]);
  const lastMoveById = new Map(moves.map((m) => [m._id, m.last]));
  for (const it of items) { it.lastMoveAt = lastMoveById.get(it.id) || null; delete it.isLow; delete it.isOut; }

  const [kpi] = await Product.aggregate([
    { $unwind: '$variants' },
    { $match: { isActive: true, 'variants.isActive': true } },
    { $group: {
      _id: null,
      units: { $sum: '$variants.stock' },
      low: { $sum: { $cond: [{ $and: [{ $gt: ['$variants.stock', 0] }, { $lte: ['$variants.stock', '$variants.lowStockThreshold'] }] }, 1, 0] } },
      out: { $sum: { $cond: [{ $eq: ['$variants.stock', 0] }, 1, 0] } },
      packs: { $sum: 1 },
      retailValue: { $sum: { $multiply: ['$variants.stock', '$variants.price'] } },
      costValue: { $sum: { $multiply: ['$variants.stock', { $ifNull: ['$variants.costPrice', 0] }] } },
    } },
  ]);
  res.json({ items, kpis: kpi ? { units: kpi.units, low: kpi.low, out: kpi.out, packs: kpi.packs, retailValue: kpi.retailValue, costValue: kpi.costValue } : { units: 0, low: 0, out: 0, packs: 0, retailValue: 0, costValue: 0 } });
}));

// Stock change log
r.get('/movements', asyncH(async (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 20);
  const filter: Record<string, any> = {};
  if (req.query.variantId) filter.variantId = Number(req.query.variantId);
  const moves = await StockMovement.find(filter).sort({ createdAt: -1, id: -1 }).limit(limit).lean();

  const isNum = (x: number | null | undefined): x is number => x != null;
  const variantIds = [...new Set(moves.map((m) => m.variantId))];
  const orderIds = [...new Set(moves.map((m) => m.orderId).filter(isNum))];
  const adminIds = [...new Set(moves.map((m) => m.adminId).filter(isNum))];
  const [products, orders, admins] = await Promise.all([
    Product.find({ 'variants.id': { $in: variantIds } }, { nameEn: 1, variants: 1 }).lean<ProductDoc[]>(),
    Order.find({ id: { $in: orderIds } }).select({ id: 1, orderNo: 1 }).lean<OrderDoc[]>(),
    Admin.find({ id: { $in: adminIds } }).select({ id: 1, name: 1 }).lean<AdminDoc[]>(),
  ]);
  const variantInfo = new Map<number, any>();
  for (const p of products) for (const v of p.variants) variantInfo.set(v.id, { packSize: v.packSize, sku: v.sku, product: p.nameEn });
  const orderNoById = new Map(orders.map((o) => [o.id, o.orderNo]));
  const adminNameById = new Map(admins.map((a) => [a.id, a.name]));

  res.json(moves.map((m) => ({
    ...m,
    ...(variantInfo.get(m.variantId) || {}),
    adminName: m.adminId ? adminNameById.get(m.adminId) : undefined,
    orderNo: m.orderId ? orderNoById.get(m.orderId) : undefined,
  })));
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
  const result = await tx(async (session) => {
    const p = await Product.findOne({ 'variants.id': b.variantId }, { variants: { $elemMatch: { id: b.variantId } } }, { session });
    const v = p?.variants?.[0];
    if (!v) throw new HttpError(404, 'Pack not found');
    let left: number | null;
    if (b.action === 'SET') {
      left = await setStock(session, { variantId: v.id, value: b.qty, type: 'SET', note: b.note || 'Stock count', adminId: req.admin!.id });
    } else {
      left = await moveStock(session, {
        variantId: v.id,
        change: b.action === 'ADD' ? b.qty : -b.qty,
        type: b.action === 'ADD' ? 'INWARD' : 'DEDUCT',
        note: b.note || null,
        adminId: req.admin!.id,
      });
      if (left === null) throw new HttpError(400, `Only ${v.stock} in stock. Cannot remove ${b.qty}.`);
    }
    if (b.lowStockThreshold !== undefined) {
      await Product.updateOne({ 'variants.id': v.id }, { $set: { 'variants.$.lowStockThreshold': b.lowStockThreshold, 'variants.$.updatedAt': new Date() } }, { session });
    }
    return { variantId: v.id, stock: left };
  });
  res.json(result);
}));

// CSV stock sheet
r.get('/export.csv', asyncH(async (_req, res) => {
  const rows = await Product.aggregate([
    { $unwind: '$variants' },
    { $match: { 'variants.isActive': true } },
    { $lookup: { from: 'categories', localField: 'categoryId', foreignField: 'id', as: 'cat' } },
    { $project: {
      _id: 0, nameEn: '$nameEn', packSize: '$variants.packSize', sku: '$variants.sku',
      category: { $arrayElemAt: ['$cat.nameEn', 0] }, stock: '$variants.stock', lowStockThreshold: '$variants.lowStockThreshold',
      price: '$variants.price', costPrice: '$variants.costPrice', grams: '$variants.grams',
    } },
    { $sort: { nameEn: 1, grams: 1 } },
  ]);
  const esc = (x: any) => `"${String(x ?? '').replace(/"/g, '""')}"`;
  const head = ['Product', 'Pack', 'SKU', 'Category', 'Stock', 'Alert below', 'Price', 'Cost'];
  const body = rows.map((x) => [x.nameEn, x.packSize, x.sku, x.category, x.stock, x.lowStockThreshold, x.price, x.costPrice].map(esc).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sn-stock-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + [head.join(','), ...body].join('\n'));
}));

export default r;
