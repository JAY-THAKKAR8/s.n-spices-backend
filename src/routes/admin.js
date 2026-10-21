import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, one, tx } from '../db.js';
import { asyncH, HttpError } from '../lib/utils.js';
import { loadProducts } from '../lib/products.js';
import { loadOrders } from '../lib/orders.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const r = Router();

// ---------- Auth ----------
r.post('/login', validate(z.object({ email: z.string().email(), password: z.string().min(1) })), asyncH(async (req, res) => {
  const a = await one('SELECT * FROM admins WHERE email = $1', [req.body.email.toLowerCase()]);
  if (!a || !(await bcrypt.compare(req.body.password, a.password))) throw new HttpError(401, 'Wrong email or password');
  const token = jwt.sign({ id: a.id, role: a.role, name: a.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, admin: { id: a.id, name: a.name, email: a.email, role: a.role } });
}));

r.use(requireAdmin);

r.get('/me', (req, res) => res.json(req.admin));

// ---------- Dashboard ----------
r.get('/stats', asyncH(async (_req, res) => {
  const s = await one(`SELECT
    (SELECT COUNT(*)::int FROM orders WHERE created_at >= CURRENT_DATE) AS orders_today,
    (SELECT COALESCE(SUM(total),0) FROM orders WHERE created_at >= CURRENT_DATE AND status <> 'CANCELLED') AS revenue_today,
    (SELECT COUNT(*)::int FROM orders WHERE status IN ('PENDING','CONFIRMED','PACKED')) AS pending,
    (SELECT COUNT(*)::int FROM b2b_inquiries WHERE status = 'NEW') AS new_inquiries,
    (SELECT COUNT(*)::int FROM product_variants WHERE stock < 10 AND is_active) AS low_stock`);
  res.json(s);
}));

// ---------- Orders ----------
const STATUSES = ['PENDING', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];

r.get('/orders', asyncH(async (req, res) => {
  const conds = [];
  const params = [];
  if (req.query.status && STATUSES.includes(req.query.status)) {
    params.push(req.query.status);
    conds.push(`o.status = $${params.length}`);
  }
  if (req.query.q) {
    params.push(`%${req.query.q}%`);
    const p = `$${params.length}`;
    conds.push(`(o.order_no ILIKE ${p} OR o.phone ILIKE ${p} OR o.name ILIKE ${p})`);
  }
  res.json(await loadOrders(conds.join(' AND ') || 'TRUE', params));
}));

r.patch('/orders/:id', validate(z.object({
  status: z.enum(STATUSES).optional(),
  paymentStatus: z.enum(['UNPAID', 'PAID', 'REFUNDED']).optional(),
})), asyncH(async (req, res) => {
  const id = Number(req.params.id);
  await tx(async (db) => {
    const old = await db.one('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
    if (!old) throw new HttpError(404, 'Order not found');
    const { status, paymentStatus } = req.body;

    // cancel -> stock goes back. un-cancel -> take stock again.
    if (status === 'CANCELLED' && old.status !== 'CANCELLED') {
      await db.q(`UPDATE product_variants v SET stock = v.stock + i.qty
                  FROM order_items i WHERE i.order_id = $1 AND v.id = i.variant_id`, [id]);
    }
    if (status && status !== 'CANCELLED' && old.status === 'CANCELLED') {
      throw new HttpError(400, 'Cancelled order cannot be reopened. Place a new order.');
    }
    await db.q(
      `UPDATE orders SET status = COALESCE($2, status), payment_status = COALESCE($3, payment_status), updated_at = now()
       WHERE id = $1`,
      [id, status ?? null, paymentStatus ?? null],
    );
  });
  const [o] = await loadOrders('o.id = $1', [id], 1);
  res.json(o);
}));

// ---------- Categories ----------
r.get('/categories', asyncH(async (_req, res) => {
  res.json(await query('SELECT * FROM categories ORDER BY sort_order'));
}));

// ---------- Products ----------
const variantSchema = z.object({
  id: z.number().int().optional(),
  packSize: z.string().trim().min(1),
  grams: z.coerce.number().int().min(0),
  price: z.coerce.number().positive(),
  mrp: z.coerce.number().positive(),
  stock: z.coerce.number().int().min(0),
  isActive: z.boolean().default(true),
});

const productSchema = z.object({
  categoryId: z.coerce.number().int(),
  slug: z.string().trim().min(2).regex(/^[a-z0-9-]+$/, 'use small letters, numbers and -'),
  nameEn: z.string().trim().min(2),
  nameGu: z.string().trim().optional().nullable(),
  nameHi: z.string().trim().optional().nullable(),
  description: z.string().optional().nullable(),
  highlight: z.string().optional().nullable(),
  origin: z.string().optional().nullable(),
  badge: z.string().optional().nullable(),
  image: z.string().url().optional().nullable().or(z.literal('')),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
  botanicalName: z.string().trim().max(120).optional().nullable(),
  grade: z.string().trim().max(120).optional().nullable(),
  storage: z.string().max(1000).optional().nullable(),
  extraImages: z.array(z.string().url()).max(8).default([]),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  specs: z.array(z.object({ label: z.string().trim().min(1).max(40), value: z.string().trim().min(1).max(200) })).max(20).default([]),
  tasteNotes: z.array(z.object({
    label: z.string().trim().min(1).max(40),
    text: z.string().trim().max(120).default(''),
    level: z.coerce.number().int().min(0).max(100).default(70),
  })).max(8).default([]),
  uses: z.array(z.object({
    title: z.string().trim().min(1).max(60),
    text: z.string().trim().max(400).default(''),
    tip: z.string().trim().max(60).default(''),
  })).max(8).default([]),
  variants: z.array(variantSchema).min(1, 'Add at least one pack size'),
});

const productCols = (b) => [b.categoryId, b.slug, b.nameEn, b.nameGu || null, b.nameHi || null, b.description || null,
  b.highlight || null, b.origin || null, b.badge || null, b.image || null, b.isFeatured, b.isActive,
  b.botanicalName || null, b.grade || null, b.storage || null, JSON.stringify(b.extraImages), JSON.stringify(b.tags),
  JSON.stringify(b.specs), JSON.stringify(b.tasteNotes), JSON.stringify(b.uses)];

r.get('/products', asyncH(async (_req, res) => {
  res.json(await loadProducts({ orderBy: 'p.id ASC', onlyActiveVariants: false }));
}));

r.post('/products', validate(productSchema), asyncH(async (req, res) => {
  const b = req.body;
  const id = await tx(async (db) => {
    if (await db.one('SELECT id FROM products WHERE slug = $1', [b.slug])) throw new HttpError(400, 'Slug already used');
    const p = await db.one(
      `INSERT INTO products (category_id, slug, name_en, name_gu, name_hi, description, highlight, origin, badge, image, is_featured, is_active,
         botanical_name, grade, storage, images, tags, specs, taste_notes, uses)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
      productCols(b),
    );
    for (const v of b.variants) {
      await db.q('INSERT INTO product_variants (product_id, pack_size, grams, price, mrp, stock, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [p.id, v.packSize, v.grams, v.price, v.mrp, v.stock, v.isActive]);
    }
    return p.id;
  });
  const [p] = await loadProducts({ where: 'p.id = $1', params: [id], onlyActiveVariants: false });
  res.status(201).json(p);
}));

r.put('/products/:id', validate(productSchema), asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body;
  await tx(async (db) => {
    const clash = await db.one('SELECT id FROM products WHERE slug = $1 AND id <> $2', [b.slug, id]);
    if (clash) throw new HttpError(400, 'Slug already used');
    const upd = await db.one(
      `UPDATE products SET category_id=$1, slug=$2, name_en=$3, name_gu=$4, name_hi=$5, description=$6, highlight=$7,
         origin=$8, badge=$9, image=$10, is_featured=$11, is_active=$12,
         botanical_name=$13, grade=$14, storage=$15, images=$16, tags=$17, specs=$18, taste_notes=$19, uses=$20, updated_at=now()
       WHERE id=$21 RETURNING id`,
      [...productCols(b), id],
    );
    if (!upd) throw new HttpError(404, 'Product not found');

    // packs removed in the form: hide if already in orders, else delete
    const keep = b.variants.filter((v) => v.id).map((v) => v.id);
    const removed = await db.q(
      `SELECT v.id, EXISTS (SELECT 1 FROM order_items i WHERE i.variant_id = v.id) AS used
       FROM product_variants v WHERE v.product_id = $1 AND NOT (v.id = ANY($2))`,
      [id, keep],
    );
    for (const v of removed) {
      if (v.used) await db.q('UPDATE product_variants SET is_active = false WHERE id = $1', [v.id]);
      else await db.q('DELETE FROM product_variants WHERE id = $1', [v.id]);
    }
    for (const v of b.variants) {
      if (v.id) {
        await db.q('UPDATE product_variants SET pack_size=$1, grams=$2, price=$3, mrp=$4, stock=$5, is_active=$6 WHERE id=$7 AND product_id=$8',
          [v.packSize, v.grams, v.price, v.mrp, v.stock, v.isActive, v.id, id]);
      } else {
        await db.q('INSERT INTO product_variants (product_id, pack_size, grams, price, mrp, stock, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [id, v.packSize, v.grams, v.price, v.mrp, v.stock, v.isActive]);
      }
    }
  });
  const [p] = await loadProducts({ where: 'p.id = $1', params: [id], onlyActiveVariants: false });
  res.json(p);
}));

// soft delete, keeps order history safe
r.delete('/products/:id', asyncH(async (req, res) => {
  await query('UPDATE products SET is_active = false, updated_at = now() WHERE id = $1', [Number(req.params.id)]);
  res.json({ ok: true });
}));

// ---------- Coupons ----------
const couponSchema = z.object({
  code: z.string().trim().min(3).transform((s) => s.toUpperCase()),
  type: z.enum(['PERCENT', 'FLAT']),
  value: z.coerce.number().positive(),
  minOrder: z.coerce.number().min(0).default(0),
  maxOff: z.coerce.number().positive().optional().nullable(),
  validTill: z.coerce.date().optional().nullable(),
  isActive: z.boolean().default(true),
});
const couponVals = (b) => [b.code, b.type, b.value, b.minOrder, b.maxOff ?? null, b.validTill ?? null, b.isActive];

r.get('/coupons', asyncH(async (_req, res) => {
  res.json(await query('SELECT * FROM coupons ORDER BY id DESC'));
}));

r.post('/coupons', validate(couponSchema), asyncH(async (req, res) => {
  if (await one('SELECT id FROM coupons WHERE code = $1', [req.body.code])) throw new HttpError(400, 'Code already exists');
  res.status(201).json(await one(
    'INSERT INTO coupons (code, type, value, min_order, max_off, valid_till, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    couponVals(req.body),
  ));
}));

r.put('/coupons/:id', validate(couponSchema), asyncH(async (req, res) => {
  const row = await one(
    'UPDATE coupons SET code=$1, type=$2, value=$3, min_order=$4, max_off=$5, valid_till=$6, is_active=$7 WHERE id=$8 RETURNING *',
    [...couponVals(req.body), Number(req.params.id)],
  );
  if (!row) throw new HttpError(404, 'Coupon not found');
  res.json(row);
}));

// ---------- B2B inquiries ----------
r.get('/inquiries', asyncH(async (_req, res) => {
  res.json(await query('SELECT * FROM b2b_inquiries ORDER BY created_at DESC'));
}));

r.patch('/inquiries/:id', validate(z.object({ status: z.enum(['NEW', 'CONTACTED', 'CLOSED']) })), asyncH(async (req, res) => {
  const row = await one('UPDATE b2b_inquiries SET status = $1 WHERE id = $2 RETURNING *', [req.body.status, Number(req.params.id)]);
  if (!row) throw new HttpError(404, 'Not found');
  res.json(row);
}));

export default r;
