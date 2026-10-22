import { Router } from 'express';
import { z } from 'zod';
import { Category, Product, Order, Customer, B2bInquiry } from '../models/index.js';
import { tx, nextId } from '../db.js';
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
  const [cats, counts] = await Promise.all([
    Category.find({ isActive: true }).sort({ sortOrder: 1 }).lean(),
    Product.aggregate([{ $match: { isActive: true } }, { $group: { _id: '$categoryId', n: { $sum: 1 } } }]),
  ]);
  const countById = new Map(counts.map((c) => [c._id, c.n]));
  res.json(cats.map((c) => ({ ...c, productCount: countById.get(c.id) || 0 })));
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
  const filter: Record<string, any> = { isActive: true };

  if (category && category !== 'all') {
    const cat = await Category.findOne({ slug: category }).lean();
    filter.categoryId = cat ? cat.id : -1;
  }
  if (featured === 'true') filter.isFeatured = true;
  if (q) {
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ nameEn: re }, { nameGu: re }, { nameHi: re }, { highlight: re }];
  }
  // product must have at least one pack that matches price/pack filters
  const vm: Record<string, any> = { isActive: true };
  if (minPrice != null) vm.price = { ...vm.price, $gte: minPrice };
  if (maxPrice != null) vm.price = { ...vm.price, $lte: maxPrice };
  if (pack) vm.packSize = { $in: pack.split(',').map((s: string) => s.trim()) };
  filter.variants = { $elemMatch: vm };

  let items: any[] = await loadProducts({
    filter,
    sort: sort === 'newest' ? { createdAt: -1 } : { isFeatured: -1, id: 1 },
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
  const [product] = await loadProducts({ filter: { slug: req.params.slug, isActive: true }, lang });
  if (!product) throw new HttpError(404, 'Product not found');
  const related = await loadProducts({
    filter: { categoryId: product.categoryId, id: { $ne: product.id }, isActive: true },
    lang,
  });
  // small category? fill with best sellers from other categories
  if (related.length < 4) {
    const more = await loadProducts({
      filter: { isActive: true, isFeatured: true, id: { $ne: product.id }, categoryId: { $ne: product.categoryId } },
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
    filter: { isActive: true, id: { $nin: exclude } },
    lang: (req.query.lang as string) || 'en',
  });
  // shuffle, then take 3 (category list is small, so this stays cheap)
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
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

  const order = await tx(async (session) => {
    let customer = await Customer.findOneAndUpdate(
      { phone: b.phone },
      { $set: { name: b.name } },
      { new: true, session },
    );
    if (!customer) {
      const customerId = await nextId('customer', session);
      [customer] = await Customer.create([{ id: customerId, name: b.name, phone: b.phone }], { session });
    }

    // take stock; fail if someone bought it first
    for (const l of quote.lines) {
      const ok = await Product.findOneAndUpdate(
        { 'variants.id': l.variantId, 'variants.stock': { $gte: l.qty } },
        { $inc: { 'variants.$.stock': -l.qty } },
        { session },
      );
      if (!ok) throw new HttpError(409, `${l.name} (${l.packSize}) just went out of stock`);
    }

    const orderId = await nextId('order', session);
    const items = quote.lines.map((l, i) => ({
      id: i + 1,
      variantId: l.variantId,
      name: l.name,
      packSize: l.packSize,
      price: l.price,
      qty: l.qty,
      lineTotal: l.lineTotal,
    }));
    const [o] = await Order.create(
      [{
        id: orderId,
        orderNo: makeOrderNo(),
        customerId: customer.id,
        name: b.name,
        phone: b.phone,
        address: b.address,
        city: b.city,
        pincode: b.pincode,
        note: b.note || null,
        subtotal: quote.subtotal,
        discount: quote.discount,
        deliveryFee: quote.deliveryFee,
        total: quote.total,
        couponId: quote.coupon?.id ?? null,
        paymentMethod: b.paymentMethod,
        items,
      }],
      { session },
    );
    return o.toObject();
  });

  res.status(201).json(order);
}));

// Track: order no + phone (no login needed)
r.get('/orders/track', asyncH(async (req, res) => {
  const { orderNo, phone } = req.query;
  if (!orderNo || !phone) throw new HttpError(400, 'Order number and phone needed');
  const [o] = await loadOrders({ orderNo: String(orderNo).trim().toUpperCase(), phone: String(phone).trim() }, 1);
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
  const id = await nextId('b2bInquiry');
  const row = await B2bInquiry.create({
    id, businessName: b.businessName, phone: b.phone, product: b.product, monthlyQty: b.monthlyQty, cityPincode: b.cityPincode,
  });
  res.status(201).json({ id: row.id, ok: true });
}));

export default r;
