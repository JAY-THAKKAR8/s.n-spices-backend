import { Router } from 'express';
import { z } from 'zod';
import { query, one, tx } from '../../db.js';
import { asyncH, HttpError } from '../../lib/utils.js';
import { loadProducts } from '../../lib/products.js';
import { validate } from '../../middleware/validate.js';
import { moveStock, setStock } from '../../lib/stock.js';

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
const str = (max) => z.string().trim().max(max);
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

const COLS = `category_id, slug, name_en, name_gu, name_hi, description, highlight, origin, badge, image, is_featured, is_active,
  scientific_name, grade, details, images, hsn_code, gst_rate`;
const productVals = (b) => [b.categoryId, b.slug, b.nameEn, b.nameGu || null, b.nameHi || null, b.description || null,
  b.highlight || null, b.origin || null, b.badge || null, b.image || null, b.isFeatured, b.isActive,
  b.scientificName || null, b.grade || null, JSON.stringify(b.details || {}), JSON.stringify(b.images || []),
  b.hsnCode || null, b.gstRate ?? null];

const autoSku = (productId, pack) => `SN-${String(productId).padStart(3, '0')}-${pack.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;

async function insertVariant(db, productId, v, adminId) {
  const row = await db.one(
    `INSERT INTO product_variants (product_id, pack_size, grams, price, mrp, cost_price, stock, low_stock_threshold, sku, is_active)
     VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9) RETURNING id`,
    [productId, v.packSize, v.grams, v.price, v.mrp, v.costPrice ?? null, v.lowStockThreshold, v.sku || autoSku(productId, v.packSize), v.isActive],
  );
  if (v.stock > 0) await moveStock(db, { variantId: row.id, change: v.stock, type: 'INWARD', note: 'Opening stock', adminId });
}

r.get('/', asyncH(async (_req, res) => {
  res.json(await loadProducts({ orderBy: 'p.created_at DESC, p.id DESC', onlyActiveVariants: false, admin: true }));
}));

r.get('/:id', asyncH(async (req, res) => {
  const [p] = await loadProducts({ where: 'p.id = $1', params: [Number(req.params.id)], onlyActiveVariants: false, admin: true });
  if (!p) throw new HttpError(404, 'Product not found');
  const sold = await one(
    `SELECT COALESCE(SUM(i.qty),0)::int AS units, COALESCE(SUM(i.line_total),0) AS revenue
     FROM order_items i JOIN product_variants v ON v.id = i.variant_id JOIN orders o ON o.id = i.order_id
     WHERE v.product_id = $1 AND o.status <> 'CANCELLED' AND o.created_at >= now() - interval '30 days'`,
    [p.id],
  );
  res.json({ ...p, sold30: sold });
}));

r.post('/', validate(productSchema), asyncH(async (req, res) => {
  const b = req.body;
  const id = await tx(async (db) => {
    if (await db.one('SELECT id FROM products WHERE slug = $1', [b.slug])) throw new HttpError(400, 'This URL (slug) is already used');
    const p = await db.one(`INSERT INTO products (${COLS}) VALUES (${productVals(b).map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`, productVals(b));
    for (const v of b.variants) await insertVariant(db, p.id, v, req.admin.id);
    return p.id;
  });
  const [p] = await loadProducts({ where: 'p.id = $1', params: [id], onlyActiveVariants: false, admin: true });
  res.status(201).json(p);
}));

r.put('/:id', validate(productSchema), asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body;
  await tx(async (db) => {
    if (await db.one('SELECT id FROM products WHERE slug = $1 AND id <> $2', [b.slug, id])) throw new HttpError(400, 'This URL (slug) is already used');
    const vals = productVals(b);
    const sets = COLS.split(',').map((c, i) => `${c.trim()} = $${i + 1}`).join(', ');
    const upd = await db.one(`UPDATE products SET ${sets}, updated_at = now() WHERE id = $${vals.length + 1} RETURNING id`, [...vals, id]);
    if (!upd) throw new HttpError(404, 'Product not found');

    // packs removed in the form: hide if already sold, else delete
    const keep = b.variants.filter((v) => v.id).map((v) => v.id);
    const removed = await db.q(
      `SELECT v.id, EXISTS (SELECT 1 FROM order_items i WHERE i.variant_id = v.id) AS used
       FROM product_variants v WHERE v.product_id = $1 AND NOT (v.id = ANY($2))`,
      [id, keep],
    );
    for (const v of removed) {
      if (v.used) await db.q('UPDATE product_variants SET is_active = false, updated_at = now() WHERE id = $1', [v.id]);
      else await db.q('DELETE FROM product_variants WHERE id = $1', [v.id]);
    }
    for (const v of b.variants) {
      if (!v.id) { await insertVariant(db, id, v, req.admin.id); continue; }
      const own = await db.one('SELECT id FROM product_variants WHERE id = $1 AND product_id = $2', [v.id, id]);
      if (!own) throw new HttpError(400, 'Pack does not belong to this product');
      await db.q(
        `UPDATE product_variants SET pack_size=$1, grams=$2, price=$3, mrp=$4, cost_price=$5, low_stock_threshold=$6,
           sku=$7, is_active=$8, updated_at=now() WHERE id=$9`,
        [v.packSize, v.grams, v.price, v.mrp, v.costPrice ?? null, v.lowStockThreshold, v.sku || autoSku(id, v.packSize), v.isActive, v.id],
      );
      await setStock(db, { variantId: v.id, value: v.stock, type: 'EDIT', note: 'Changed in product form', adminId: req.admin.id });
    }
  });
  const [p] = await loadProducts({ where: 'p.id = $1', params: [id], onlyActiveVariants: false, admin: true });
  res.json(p);
}));

// Show / hide many products at once
r.patch('/bulk', validate(z.object({ ids: z.array(z.number().int()).min(1).max(200), isActive: z.boolean().optional(), isFeatured: z.boolean().optional() })), asyncH(async (req, res) => {
  const { ids, isActive, isFeatured } = req.body;
  if (isActive === undefined && isFeatured === undefined) throw new HttpError(400, 'Nothing to change');
  const rows = await query(
    `UPDATE products SET is_active = COALESCE($2, is_active), is_featured = COALESCE($3, is_featured), updated_at = now()
     WHERE id = ANY($1) RETURNING id`,
    [ids, isActive ?? null, isFeatured ?? null],
  );
  res.json({ updated: rows.length });
}));

// Soft delete keeps order history safe
r.delete('/:id', asyncH(async (req, res) => {
  await query('UPDATE products SET is_active = false, updated_at = now() WHERE id = $1', [Number(req.params.id)]);
  res.json({ ok: true });
}));

export default r;
