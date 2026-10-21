import { Router } from 'express';
import { z } from 'zod';
import { query, one, tx } from '../db.js';
import { asyncH, HttpError, makeOrderNo } from '../lib/utils.js';
import { loadProducts } from '../lib/products.js';
import { loadOrders } from '../lib/orders.js';
import { priceCart, applyCoupon } from '../lib/pricing.js';
import { validate } from '../middleware/validate.js';

const r = Router();

// ---------- Settings ----------
r.get('/settings', (_req, res) => {
  res.json({
    freeDeliveryMin: Number(process.env.FREE_DELIVERY_MIN || 499),
    deliveryFee: Number(process.env.DELIVERY_FEE || 40),
    whatsapp: process.env.STORE_WHATSAPP || '919601901832',
  });
});

// ---------- Categories ----------
r.get('/categories', asyncH(async (_req, res) => {
  res.json(await query(
    `SELECT c.*, COUNT(p.id)::int AS product_count
     FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.is_active
     WHERE c.is_active GROUP BY c.id ORDER BY c.sort_order`,
  ));
}));

// ---------- Products ----------
const listQuery = z.object({
  category: z.string().optional(),
  q: z.string().trim().optional(),
  featured: z.enum(['true', 'false']).optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  pack: z.string().optional(), // comma list "100g,250g"
  sort: z.enum(['popular', 'price_asc', 'price_desc', 'discount', 'newest']).default('popular'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(60).default(12),
  lang: z.enum(['en', 'gu', 'hi']).default('en'),
});

r.get('/products', validate(listQuery, 'query'), asyncH(async (req, res) => {
  const { category, q, featured, minPrice, maxPrice, pack, sort, page, limit, lang } = req.validQuery;
  const conds = ['p.is_active'];
  const params: any[] = [];
  const add = (v: any) => { params.push(v); return `$${params.length}`; };

  if (category && category !== 'all') conds.push(`c.slug = ${add(category)}`);
  if (featured === 'true') conds.push('p.is_featured');
  if (q) {
    const like = add(`%${q}%`);
    conds.push(`(p.name_en ILIKE ${like} OR p.name_gu ILIKE ${like} OR p.name_hi ILIKE ${like} OR p.highlight ILIKE ${like})`);
  }
  // product must have at least one pack that matches price/pack filters
  const vc = ['v2.is_active'];
  if (minPrice != null) vc.push(`v2.price >= ${add(minPrice)}`);
  if (maxPrice != null) vc.push(`v2.price <= ${add(maxPrice)}`);
  if (pack) vc.push(`v2.pack_size = ANY(${add(pack.split(',').map((s: string) => s.trim()))})`);
  conds.push(`EXISTS (SELECT 1 FROM product_variants v2 WHERE v2.product_id = p.id AND ${vc.join(' AND ')})`);

  let items: any[] = await loadProducts({
    where: conds.join(' AND '),
    params,
    orderBy: sort === 'newest' ? 'p.created_at DESC' : 'p.is_featured DESC, p.id ASC',
    lang,
  });
  if (sort === 'price_asc') items.sort((a, b) => a.minPrice - b.minPrice);
  if (sort === 'price_desc') items.sort((a, b) => b.minPrice - a.minPrice);
  if (sort === 'discount') items.sort((a, b) => b.discountPct - a.discountPct);

  const total = items.length;
  items = items.slice((page - 1) * limit, page * limit);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}));

r.get('/products/:slug', asyncH(async (req, res) => {
  const lang = (req.query.lang as string) || 'en';
  const [product] = await loadProducts({ where: 'p.slug = $1 AND p.is_active', params: [req.params.slug], lang });
  if (!product) throw new HttpError(404, 'Product not found');
  const related = await loadProducts({
    where: 'p.category_id = $1 AND p.id <> $2 AND p.is_active',
    params: [product.categoryId, product.id],
    lang,
  });
  // small category? fill with best sellers from other categories
  if (related.length < 4) {
    const more = await loadProducts({
      where: 'p.is_active AND p.is_featured AND p.id <> $1 AND p.category_id <> $2',
      params: [product.id, product.categoryId],
      lang,
    });
    related.push(...more);
  }
  res.json({ product, related: related.slice(0, 4) });
}));

// "Pairs well with" on cart page
r.get('/suggestions', asyncH(async (req, res) => {
  const exclude = String(req.query.exclude || '').split(',').map(Number).filter(Boolean);
  const items = await loadProducts({
    where: 'p.is_active AND NOT (p.id = ANY($1))',
    params: [exclude],
    orderBy: 'random()',
    lang: (req.query.lang as string) || 'en',
  });
  res.json(items.slice(0, 3));
}));

// ---------- Cart quote ----------
const cartBody = z.object({
  items: z.array(z.object({ variantId: z.number().int(), qty: z.number().int().min(1).max(100) })).min(1),
  couponCode: z.string().optional().nullable(),
});

r.post('/cart/quote', validate(cartBody), asyncH(async (req, res) => {
  const q = await priceCart(req.body.items, req.body.couponCode);
  res.json({ ...q, coupon: q.coupon ? { code: q.coupon.code } : null });
}));

r.post('/coupons/validate', asyncH(async (req, res) => {
  const { code, subtotal } = req.body || {};
  const { coupon, discount } = await applyCoupon(code, Number(subtotal || 0));
  if (!coupon) throw new HttpError(400, 'Enter a coupon code');
  res.json({ code: coupon.code, discount });
}));

// ---------- Orders (guest checkout) ----------
const orderBody = cartBody.extend({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter 10 digit mobile number'),
  address: z.string().trim().min(8, 'Enter full address').max(300),
  city: z.string().trim().min(2, 'Enter city').max(60),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter 6 digit pincode'),
  note: z.string().trim().max(300).optional().nullable(),
  paymentMethod: z.enum(['COD', 'WHATSAPP']),
});

r.post('/orders', validate(orderBody), asyncH(async (req, res) => {
  const b = req.body;
  const quote = await priceCart(b.items, b.couponCode);

  const order = await tx(async (db) => {
    const customer: any = await db.one(
      `INSERT INTO customers (name, phone) VALUES ($1, $2)
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [b.name, b.phone],
    );

    // take stock; fail if someone bought it first
    for (const l of quote.lines) {
      const ok = await db.one(
        'UPDATE product_variants SET stock = stock - $1 WHERE id = $2 AND stock >= $1 RETURNING id',
        [l.qty, l.variantId],
      );
      if (!ok) throw new HttpError(409, `${l.name} (${l.packSize}) just went out of stock`);
    }

    const o: any = await db.one(
      `INSERT INTO orders (order_no, customer_id, name, phone, address, city, pincode, note,
         subtotal, discount, delivery_fee, total, coupon_id, payment_method)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [makeOrderNo(), customer.id, b.name, b.phone, b.address, b.city, b.pincode, b.note || null,
        quote.subtotal, quote.discount, quote.deliveryFee, quote.total, quote.coupon?.id ?? null, b.paymentMethod],
    );

    o.items = [];
    for (const l of quote.lines) {
      o.items.push(await db.one(
        `INSERT INTO order_items (order_id, variant_id, name, pack_size, price, qty, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [o.id, l.variantId, l.name, l.packSize, l.price, l.qty, l.lineTotal],
      ));
    }
    return o;
  });

  res.status(201).json(order);
}));

// Track: order no + phone (no login needed)
r.get('/orders/track', asyncH(async (req, res) => {
  const { orderNo, phone } = req.query;
  if (!orderNo || !phone) throw new HttpError(400, 'Order number and phone needed');
  const [o] = await loadOrders('o.order_no = $1 AND o.phone = $2', [String(orderNo).trim().toUpperCase(), String(phone).trim()], 1);
  if (!o) throw new HttpError(404, 'Order not found. Check order number and phone.');
  res.json(o);
}));

// ---------- B2B inquiry ----------
const b2bBody = z.object({
  businessName: z.string().trim().min(2, 'Enter business name').max(120),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter 10 digit mobile number'),
  product: z.string().trim().min(2).max(120),
  monthlyQty: z.string().trim().min(1).max(60),
  cityPincode: z.string().trim().min(3, 'Enter city & pincode').max(120),
});

r.post('/b2b-inquiries', validate(b2bBody), asyncH(async (req, res) => {
  const b = req.body;
  const row: any = await one(
    `INSERT INTO b2b_inquiries (business_name, phone, product, monthly_qty, city_pincode)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [b.businessName, b.phone, b.product, b.monthlyQty, b.cityPincode],
  );
  res.status(201).json({ id: row.id, ok: true });
}));

export default r;
