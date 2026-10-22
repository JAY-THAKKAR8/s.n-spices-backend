import { Router } from 'express';
import { z } from 'zod';
import type { ClientSession } from 'mongoose';
import { Product, Order } from '../../models/index.js';
import { asyncH, HttpError } from '../../lib/utils.js';
import { loadProducts } from '../../lib/products.js';
import { validate } from '../../middleware/validate.js';
import { moveStock, setStock } from '../../lib/stock.js';
import { tx, nextId } from '../../db.js';

const r = Router();

const variantSchema = z.object({
  id: z.number().int().optional(),
  packSize: z.string().trim().min(1).max(30),
  grams: z.coerce.number().int().min(0),
  price: z.coerce.number().positive(),
  mrp: z.coerce.number().positive(),
  costPrice: z.coerce.number().min(0).optional().nullable(),
  stock: z.coerce.number().int().min(0),
  lowStockThreshold: z.coerce.number().int().min(0).default(10),
  sku: z.string().trim().max(40).regex(/^[A-Za-z0-9-]*$/, 'SKU: letters, numbers and - only').optional().nullable(),
  isActive: z.boolean().default(true),
}).refine((v) => v.mrp >= v.price, { message: 'MRP must be same or more than selling price', path: ['mrp'] });

// Content for the product detail page (all optional)
const str = (max: number) => z.string().trim().max(max);
const detailsSchema = z.object({
  facts: z.array(z.object({ label: str(40), value: str(40), note: str(80).optional().default('') })).max(6).optional(),
  profile: z.array(z.object({ label: str(60), note: str(120).optional().default(''), level: z.coerce.number().min(0).max(100) })).max(6).optional(),
  tags: z.array(str(40)).max(12).optional(),
  uses: z.array(z.object({ title: str(60), text: str(400), tip: str(80).optional().default('') })).max(8).optional(),
  compare: z.array(z.object({ metric: str(60), ours: str(120), market: str(120) })).max(10).optional(),
  faqs: z.array(z.object({ q: str(160), a: str(600) })).max(10).optional(),
  storage: str(300).optional(),
  shelfLife: str(60).optional(),
}).strip();

const url = z.string().trim().url('Enter a full image link (https://…)');
const productSchema = z.object({
  categoryId: z.coerce.number().int(),
  slug: z.string().trim().min(2).regex(/^[a-z0-9-]+$/, 'URL: small letters, numbers and - only'),
  nameEn: z.string().trim().min(2).max(120),
  nameGu: z.string().trim().max(120).optional().nullable(),
  nameHi: z.string().trim().max(120).optional().nullable(),
  description: z.string().max(3000).optional().nullable(),
  highlight: z.string().max(160).optional().nullable(),
  origin: z.string().max(80).optional().nullable(),
  badge: z.string().max(40).optional().nullable(),
  image: url.optional().nullable().or(z.literal('')),
  images: z.array(url).max(8).default([]),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
  scientificName: z.string().trim().max(120).optional().nullable(),
  grade: z.string().trim().max(120).optional().nullable(),
  hsnCode: z.string().trim().max(12).optional().nullable(),
  gstRate: z.coerce.number().min(0).max(28).optional().nullable(),
  details: detailsSchema.default({}),
  variants: z.array(variantSchema).min(1, 'Add at least one pack size'),
});

const productSet = (b: any) => ({
  categoryId: b.categoryId, slug: b.slug, nameEn: b.nameEn, nameGu: b.nameGu || null, nameHi: b.nameHi || null,
  description: b.description || null, highlight: b.highlight || null, origin: b.origin || null, badge: b.badge || null,
  image: b.image || null, isFeatured: b.isFeatured, isActive: b.isActive, scientificName: b.scientificName || null,
  grade: b.grade || null, details: b.details || {}, images: b.images || [], hsnCode: b.hsnCode || null, gstRate: b.gstRate ?? null,
});

const autoSku = (productId: number, pack: string) => `SN-${String(productId).padStart(3, '0')}-${pack.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;

async function insertVariant(session: ClientSession, productId: number, v: any, adminId: number) {
  const variantId = await nextId('variant', session);
  await Product.updateOne(
    { id: productId },
    { $push: { variants: {
      id: variantId, packSize: v.packSize, grams: v.grams, price: v.price, mrp: v.mrp, costPrice: v.costPrice ?? null,
      stock: 0, lowStockThreshold: v.lowStockThreshold, sku: v.sku || autoSku(productId, v.packSize), isActive: v.isActive, updatedAt: new Date(),
    } } },
    { session },
  );
  if (v.stock > 0) await moveStock(session, { variantId, change: v.stock, type: 'INWARD', note: 'Opening stock', adminId });
}

r.get('/', asyncH(async (_req, res) => {
  res.json(await loadProducts({ sort: { createdAt: -1, id: -1 }, onlyActiveVariants: false }));
}));

r.get('/:id', asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const [p] = await loadProducts({ filter: { id }, onlyActiveVariants: false });
  if (!p) throw new HttpError(404, 'Product not found');
  const variantIds = p.variants.map((v: any) => v.id);
  const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [sold] = await Order.aggregate([
    { $match: { status: { $ne: 'CANCELLED' }, createdAt: { $gte: thirtyAgo } } },
    { $unwind: '$items' },
    { $match: { 'items.variantId': { $in: variantIds } } },
    { $group: { _id: null, units: { $sum: '$items.qty' }, revenue: { $sum: '$items.lineTotal' } } },
  ]);
  res.json({ ...p, sold30: { units: sold?.units || 0, revenue: sold?.revenue || 0 } });
}));

r.post('/', validate(productSchema), asyncH(async (req, res) => {
  const b = req.body;
  const id = await tx(async (session) => {
    if (await Product.exists({ slug: b.slug }).session(session)) throw new HttpError(400, 'This URL (slug) is already used');
    const productId = await nextId('product', session);
    await Product.create([{ id: productId, variants: [], ...productSet(b) }], { session });
    for (const v of b.variants) await insertVariant(session, productId, v, req.admin!.id);
    return productId;
  });
  const [p] = await loadProducts({ filter: { id }, onlyActiveVariants: false });
  res.status(201).json(p);
}));

r.put('/:id', validate(productSchema), asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body;
  await tx(async (session) => {
    if (await Product.exists({ slug: b.slug, id: { $ne: id } }).session(session)) throw new HttpError(400, 'This URL (slug) is already used');
    const current = await Product.findOne({ id }, { variants: 1 }, { session });
    if (!current) throw new HttpError(404, 'Product not found');
    await Product.updateOne({ id }, { $set: productSet(b) }, { session });

    // packs removed in the form: hide if already sold, else delete
    const keep = new Set(b.variants.filter((v: any) => v.id).map((v: any) => v.id));
    const removed = current.variants.filter((v) => !keep.has(v.id));
    for (const v of removed) {
      const used = await Order.exists({ 'items.variantId': v.id }).session(session);
      if (used) await Product.updateOne({ id, 'variants.id': v.id }, { $set: { 'variants.$.isActive': false, 'variants.$.updatedAt': new Date() } }, { session });
      else await Product.updateOne({ id }, { $pull: { variants: { id: v.id } } }, { session });
    }
    for (const v of b.variants) {
      if (!v.id) { await insertVariant(session, id, v, req.admin!.id); continue; }
      if (!current.variants.some((x) => x.id === v.id)) throw new HttpError(400, 'Pack does not belong to this product');
      await Product.updateOne(
        { id, 'variants.id': v.id },
        { $set: {
          'variants.$.packSize': v.packSize, 'variants.$.grams': v.grams, 'variants.$.price': v.price, 'variants.$.mrp': v.mrp,
          'variants.$.costPrice': v.costPrice ?? null, 'variants.$.lowStockThreshold': v.lowStockThreshold,
          'variants.$.sku': v.sku || autoSku(id, v.packSize), 'variants.$.isActive': v.isActive, 'variants.$.updatedAt': new Date(),
        } },
        { session },
      );
      await setStock(session, { variantId: v.id, value: v.stock, type: 'EDIT', note: 'Changed in product form', adminId: req.admin!.id });
    }
  });
  const [p] = await loadProducts({ filter: { id }, onlyActiveVariants: false });
  res.json(p);
}));

// Show / hide many products at once
r.patch('/bulk', validate(z.object({ ids: z.array(z.number().int()).min(1).max(200), isActive: z.boolean().optional(), isFeatured: z.boolean().optional() })), asyncH(async (req, res) => {
  const { ids, isActive, isFeatured } = req.body;
  if (isActive === undefined && isFeatured === undefined) throw new HttpError(400, 'Nothing to change');
  const set: Record<string, any> = {};
  if (isActive !== undefined) set.isActive = isActive;
  if (isFeatured !== undefined) set.isFeatured = isFeatured;
  const result = await Product.updateMany({ id: { $in: ids } }, { $set: set });
  res.json({ updated: result.modifiedCount });
}));

// Soft delete keeps order history safe
r.delete('/:id', asyncH(async (req, res) => {
  await Product.updateOne({ id: Number(req.params.id) }, { $set: { isActive: false } });
  res.json({ ok: true });
}));

export default r;
