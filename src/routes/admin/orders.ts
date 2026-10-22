import { Router } from 'express';
import { z } from 'zod';
import { Order, OrderItemDoc, Product, Category, Customer, Coupon, Admin } from '../../models/index.js';
import { asyncH, HttpError } from '../../lib/utils.js';
import { validate } from '../../middleware/validate.js';
import { moveStock, addOrderEvent } from '../../lib/stock.js';
import { getSettings } from '../../lib/settings.js';
import { tx, nextId } from '../../db.js';

const r = Router();

export const STATUSES = ['PENDING', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'] as const;
const LABEL: Record<string, string> = {
  PENDING: 'New order', CONFIRMED: 'Confirmed', PACKED: 'Packed',
  OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled',
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rangeStart = (range: string) => {
  const now = new Date();
  if (range === 'today') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (range === 'week') return new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
  if (range === 'month') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return null;
};

// Build Mongo filter for list + export
function orderFilter(qs: Record<string, any>) {
  const f: Record<string, any> = {};
  if (qs.status && (STATUSES as readonly string[]).includes(qs.status)) f.status = qs.status;
  if (qs.payment === 'COD' || qs.payment === 'WHATSAPP') f.paymentMethod = qs.payment;
  if (qs.paid === 'PAID' || qs.paid === 'UNPAID') f.paymentStatus = qs.paid;
  const since = qs.range && rangeStart(qs.range);
  if (since) f.createdAt = { $gte: since };
  if (qs.customerId) f.customerId = Number(qs.customerId);
  if (qs.q) {
    const re = new RegExp(escapeRe(String(qs.q).trim()), 'i');
    f.$or = [{ orderNo: re }, { phone: re }, { name: re }, { city: re }];
  }
  return f;
}

const withSummary = (o: any) => ({
  ...o,
  lineCount: o.items.length,
  unitCount: o.items.reduce((s: number, i: OrderItemDoc) => s + i.qty, 0),
  itemsText: o.items.map((i: OrderItemDoc) => `${i.name} ${i.packSize}`).join(', '),
  items: undefined,
  events: undefined,
});

// List with pagination + counts per status (counts ignore the status filter)
r.get('/', asyncH(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 15));
  const filter = orderFilter(req.query);
  const countFilter = orderFilter({ ...req.query, status: undefined });

  const [rows, total, counts] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
    Order.aggregate([{ $match: countFilter }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const byStatus: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  let all = 0;
  for (const c of counts) { byStatus[c._id] = c.n; all += c.n; }
  res.json({ items: rows.map(withSummary), total, page, pages: Math.max(1, Math.ceil(total / limit)), counts: { ALL: all, ...byStatus } });
}));

// CSV export (same filters)
r.get('/export.csv', asyncH(async (req, res) => {
  const filter = orderFilter(req.query);
  const rows = (await Order.find(filter).sort({ createdAt: -1 }).limit(5000).lean()).map(withSummary);
  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Order No', 'Date', 'Customer', 'Phone', 'City', 'Pincode', 'Items', 'Subtotal', 'Discount', 'Delivery', 'Total', 'Payment', 'Paid', 'Status', 'Courier', 'Tracking'];
  const lines = rows.map((o) => [
    o.orderNo, new Date(o.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }), o.name, o.phone, o.city, o.pincode,
    o.itemsText, o.subtotal, o.discount, o.deliveryFee, o.total, o.paymentMethod, o.paymentStatus, LABEL[o.status], o.courier, o.trackingNo,
  ].map(esc).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sn-orders-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + [head.join(','), ...lines].join('\n'));
}));

// Full order: items (with product photo + category), timeline, customer summary, seller info for invoice
r.get('/:id', asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const o = await Order.findOne({ id }).lean();
  if (!o) throw new HttpError(404, 'Order not found');

  const variantIds = o.items.map((i) => i.variantId);
  const [products, adminIds, cust, coupon, settings] = await Promise.all([
    Product.find({ 'variants.id': { $in: variantIds } }, { id: 1, slug: 1, image: 1, hsnCode: 1, gstRate: 1, categoryId: 1, variants: 1 }).lean(),
    Admin.find({}, { id: 1, name: 1 }).lean(),
    Customer.findOne({ id: o.customerId }).lean(),
    o.couponId ? Coupon.findOne({ id: o.couponId }, { code: 1, type: 1, value: 1 }).lean() : null,
    getSettings(),
  ]);
  const categories = await Category.find({}, { id: 1, nameEn: 1, slug: 1 }).lean();
  const catById = new Map(categories.map((c) => [c.id, c]));
  const adminById = new Map(adminIds.map((a) => [a.id, a.name]));

  const variantInfo = new Map<number, any>();
  for (const p of products) {
    const cat = catById.get(p.categoryId);
    for (const v of p.variants) {
      variantInfo.set(v.id, { sku: v.sku, grams: v.grams, productId: p.id, slug: p.slug, image: p.image, hsnCode: p.hsnCode, gstRate: p.gstRate, category: cat?.nameEn, categorySlug: cat?.slug });
    }
  }
  const items = o.items.map((i) => ({ ...i, ...(variantInfo.get(i.variantId) || {}) }));
  const events = o.events.map((e) => ({ ...e, adminName: e.adminId ? adminById.get(e.adminId) : undefined }));

  const [orderCount, totalSpent] = cust
    ? await Promise.all([
        Order.countDocuments({ customerId: cust.id, status: { $ne: 'CANCELLED' } }),
        Order.aggregate([{ $match: { customerId: cust.id, status: { $ne: 'CANCELLED' } } }, { $group: { _id: null, sum: { $sum: '$total' } } }]).then((r) => r[0]?.sum || 0),
      ])
    : [0, 0];
  const position = cust
    ? await Order.countDocuments({ customerId: cust.id, createdAt: { $lte: o.createdAt }, status: { $ne: 'CANCELLED' } })
    : 0;

  const weightGrams = items.reduce((g, i) => g + (i.grams || 0) * i.qty, 0);
  res.json({
    ...o,
    items,
    events,
    customer: cust ? { ...cust, orderCount, totalSpent, orderPosition: position } : null,
    coupon,
    weightGrams,
    seller: { name: settings.storeName, address: settings.storeAddress, phone: settings.storePhone, gstin: settings.gstin, fssai: settings.fssai, email: settings.storeEmail },
  });
}));

// Change status / payment / courier
const patchBody = z.object({
  status: z.enum(STATUSES).optional(),
  paymentStatus: z.enum(['UNPAID', 'PAID', 'REFUNDED']).optional(),
  courier: z.string().trim().max(60).optional().nullable(),
  trackingNo: z.string().trim().max(60).optional().nullable(),
  note: z.string().trim().max(300).optional(),
});

r.patch('/:id', validate(patchBody), asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const adminId = req.admin!.id;
  const b = req.body;
  await tx(async (session) => {
    const old = await Order.findOne({ id }, {}, { session });
    if (!old) throw new HttpError(404, 'Order not found');

    if (b.status && b.status !== old.status) {
      if (old.status === 'CANCELLED') throw new HttpError(400, 'Cancelled order cannot be reopened. Place a new order.');
      if (old.status === 'DELIVERED' && b.status !== 'CANCELLED') throw new HttpError(400, 'Order is already delivered.');
      if (b.status === 'CANCELLED') {
        for (const it of old.items) {
          await moveStock(session, { variantId: it.variantId, change: it.qty, type: 'CANCEL', orderId: id, adminId, note: `${old.orderNo} cancelled` });
        }
      }
      old.status = b.status;
      await old.save({ session });
      await addOrderEvent(session, { orderId: id, kind: 'STATUS', status: b.status, message: b.note || null, adminId });
      // cash collected on delivery
      if (b.status === 'DELIVERED' && old.paymentMethod === 'COD' && old.paymentStatus === 'UNPAID' && !b.paymentStatus) {
        await Order.updateOne({ id }, { $set: { paymentStatus: 'PAID' } }, { session });
        await addOrderEvent(session, { orderId: id, kind: 'PAYMENT', status: 'PAID', message: 'Cash collected on delivery', adminId });
      }
    }
    if (b.paymentStatus && b.paymentStatus !== old.paymentStatus) {
      await Order.updateOne({ id }, { $set: { paymentStatus: b.paymentStatus } }, { session });
      await addOrderEvent(session, { orderId: id, kind: 'PAYMENT', status: b.paymentStatus, message: b.note || null, adminId });
    }
    if (b.courier !== undefined || b.trackingNo !== undefined) {
      const courier = b.courier === undefined ? old.courier : b.courier || null;
      const tracking = b.trackingNo === undefined ? old.trackingNo : b.trackingNo || null;
      if (courier !== old.courier || tracking !== old.trackingNo) {
        await Order.updateOne({ id }, { $set: { courier, trackingNo: tracking } }, { session });
        await addOrderEvent(session, { orderId: id, kind: 'SHIPPING', message: [courier, tracking].filter(Boolean).join(' • ') || 'Shipping info removed', adminId });
      }
    }
  });
  res.json(await Order.findOne({ id }).lean());
}));

// Internal note (staff only)
r.post('/:id/notes', validate(z.object({ message: z.string().trim().min(1).max(500) })), asyncH(async (req, res) => {
  const id = Number(req.params.id);
  if (!(await Order.exists({ id }))) throw new HttpError(404, 'Order not found');
  const eventId = await nextId('orderEvent');
  const createdAt = new Date();
  await Order.updateOne({ id }, { $push: { events: { id: eventId, kind: 'NOTE', message: req.body.message, adminId: req.admin!.id, createdAt } } });
  res.status(201).json({ id: eventId, orderId: id, kind: 'NOTE', message: req.body.message, adminId: req.admin!.id, createdAt, adminName: req.admin!.name });
}));

export default r;
