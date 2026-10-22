import { Router } from 'express';
import { z } from 'zod';
import { Customer, Order } from '../../models/index.js';
import { asyncH, HttpError } from '../../lib/utils.js';
import { validate } from '../../middleware/validate.js';
import { getSettings } from '../../lib/settings.js';
import { nextId } from '../../db.js';

const r = Router();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Joins each customer to its orders and rolls up order stats (cancelled orders not counted).
const STATS_PIPELINE: any[] = [
  { $lookup: { from: 'orders', localField: 'id', foreignField: 'customerId', as: 'orders' } },
  { $addFields: {
    liveOrders: { $filter: { input: '$orders', as: 'o', cond: { $ne: ['$$o.status', 'CANCELLED'] } } },
    sortedOrders: { $sortArray: { input: '$orders', sortBy: { createdAt: -1 } } },
  } },
  { $addFields: {
    orderCount: { $size: '$liveOrders' },
    totalSpent: { $sum: '$liveOrders.total' },
    lastOrderAt: { $arrayElemAt: ['$sortedOrders.createdAt', 0] },
    lastOrderNo: { $arrayElemAt: ['$sortedOrders.orderNo', 0] },
    lastOrderId: { $arrayElemAt: ['$sortedOrders.id', 0] },
    city: { $arrayElemAt: ['$sortedOrders.city', 0] },
    pincode: { $arrayElemAt: ['$sortedOrders.pincode', 0] },
  } },
  { $project: { orders: 0, liveOrders: 0, sortedOrders: 0 } },
];

const SORTS: Record<string, Record<string, 1 | -1>> = {
  spent_desc: { totalSpent: -1, id: -1 },
  spent_asc: { totalSpent: 1, id: -1 },
  recent: { lastOrderAt: -1, id: -1 },
  orders_desc: { orderCount: -1, totalSpent: -1 },
  name: { name: 1 },
  newest: { createdAt: -1 },
};

function filterMatch(qs: Record<string, any>, vip: number) {
  const match: Record<string, any> = {};
  if (qs.q) {
    const re = new RegExp(escapeRe(String(qs.q).trim()), 'i');
    match.$or = [{ name: re }, { phone: re }, { email: re }, { city: re }];
  }
  if (qs.city) match.city = new RegExp(`^${escapeRe(String(qs.city))}$`, 'i');
  if (qs.segment === 'repeat') match.orderCount = { $gte: 2 };
  if (qs.segment === 'first') match.orderCount = 1;
  if (qs.segment === 'vip') match.totalSpent = { $gte: vip };
  if (qs.segment === 'inactive') match.lastOrderAt = { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) };
  if (qs.segment === 'none') match.orderCount = 0;
  return match;
}

r.get('/', asyncH(async (req, res) => {
  const { vipSpend } = await getSettings();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 15));
  const sort = SORTS[req.query.sort as string] || SORTS.spent_desc;
  const match = filterMatch(req.query, vipSpend);
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const ninetyAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [items, totalRows, kpiRows, segRows, cities] = await Promise.all([
    Customer.aggregate([...STATS_PIPELINE, { $match: match }, { $sort: sort }, { $skip: (page - 1) * limit }, { $limit: limit }]),
    Customer.aggregate([...STATS_PIPELINE, { $match: match }, { $count: 'n' }]),
    Customer.aggregate([...STATS_PIPELINE, { $group: {
      _id: null,
      total: { $sum: 1 },
      newMonth: { $sum: { $cond: [{ $gte: ['$createdAt', monthStart] }, 1, 0] } },
      repeat: { $sum: { $cond: [{ $gte: ['$orderCount', 2] }, 1, 0] } },
      buyers: { $sum: { $cond: [{ $gte: ['$orderCount', 1] }, 1, 0] } },
      spentSum: { $sum: '$totalSpent' },
      orderSum: { $sum: '$orderCount' },
    } }]),
    Customer.aggregate([...STATS_PIPELINE, { $group: {
      _id: null,
      all: { $sum: 1 },
      repeat: { $sum: { $cond: [{ $gte: ['$orderCount', 2] }, 1, 0] } },
      vip: { $sum: { $cond: [{ $gte: ['$totalSpent', vipSpend] }, 1, 0] } },
      first: { $sum: { $cond: [{ $eq: ['$orderCount', 1] }, 1, 0] } },
      inactive: { $sum: { $cond: [{ $lt: ['$lastOrderAt', ninetyAgo] }, 1, 0] } },
    } }]),
    Order.aggregate([
      { $group: { _id: '$city', customers: { $addToSet: '$customerId' } } },
      { $project: { _id: 0, city: '$_id', n: { $size: '$customers' } } },
      { $sort: { n: -1 } },
      { $limit: 20 },
    ]),
  ]);
  const total = totalRows[0]?.n || 0;
  const k = kpiRows[0];
  const s = segRows[0];
  res.json({
    items, total, page, pages: Math.max(1, Math.ceil(total / limit)),
    kpis: k ? { total: k.total, newMonth: k.newMonth, repeat: k.repeat, buyers: k.buyers, aov: k.orderSum ? k.spentSum / k.orderSum : 0 } : { total: 0, newMonth: 0, repeat: 0, buyers: 0, aov: 0 },
    segments: s ? { all: s.all, repeat: s.repeat, vip: s.vip, first: s.first, inactive: s.inactive } : { all: 0, repeat: 0, vip: 0, first: 0, inactive: 0 },
    cities, vipSpend,
  });
}));

r.get('/export.csv', asyncH(async (req, res) => {
  const { vipSpend } = await getSettings();
  const match = filterMatch(req.query, vipSpend);
  const rows = await Customer.aggregate([...STATS_PIPELINE, { $match: match }, { $sort: { totalSpent: -1 } }, { $limit: 10000 }]);
  const esc = (x: any) => `"${String(x ?? '').replace(/"/g, '""')}"`;
  const head = ['Name', 'Phone', 'Email', 'City', 'Pincode', 'Orders', 'Total spent', 'Last order', 'Last order date', 'Customer since'];
  const d = (x: any) => (x ? new Date(x).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : '');
  const body = rows.map((c) => [c.name, c.phone, c.email, c.city, c.pincode, c.orderCount, c.totalSpent, c.lastOrderNo, d(c.lastOrderAt), d(c.createdAt)].map(esc).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sn-customers-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + [head.join(','), ...body].join('\n'));
}));

r.get('/:id', asyncH(async (req, res) => {
  const id = Number(req.params.id);
  const [c] = await Customer.aggregate([{ $match: { id } }, ...STATS_PIPELINE]);
  if (!c) throw new HttpError(404, 'Customer not found');
  const [orders, favourites] = await Promise.all([
    Order.find({ customerId: id }, { id: 1, orderNo: 1, total: 1, status: 1, paymentStatus: 1, paymentMethod: 1, createdAt: 1, address: 1, city: 1, pincode: 1, items: 1 })
      .sort({ createdAt: -1 }).limit(50).lean(),
    Order.aggregate([
      { $match: { customerId: id, status: { $ne: 'CANCELLED' } } },
      { $unwind: '$items' },
      { $group: { _id: '$items.name', qty: { $sum: '$items.qty' } } },
      { $sort: { qty: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, name: '$_id', qty: 1 } },
    ]),
  ]);
  const ordersOut = orders.map((o) => ({ ...o, lineCount: o.items.length, items: undefined }));
  res.json({ ...c, orders: ordersOut, favourites, lastAddress: ordersOut[0] ? `${ordersOut[0].address}, ${ordersOut[0].city} - ${ordersOut[0].pincode}` : null });
}));

const custBody = z.object({
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter 10 digit mobile number'),
  email: z.string().trim().email().max(120).optional().nullable().or(z.literal('')),
  note: z.string().trim().max(300).optional().nullable(),
});

r.post('/', validate(custBody), asyncH(async (req, res) => {
  const b = req.body;
  if (await Customer.exists({ phone: b.phone })) throw new HttpError(400, 'A customer with this phone already exists');
  const id = await nextId('customer');
  res.status(201).json(await Customer.create({ id, name: b.name, phone: b.phone, email: b.email || null, note: b.note || null }));
}));

r.put('/:id', validate(custBody), asyncH(async (req, res) => {
  const b = req.body;
  const id = Number(req.params.id);
  if (await Customer.exists({ phone: b.phone, id: { $ne: id } })) throw new HttpError(400, 'Another customer has this phone');
  const row = await Customer.findOneAndUpdate({ id }, { $set: { name: b.name, phone: b.phone, email: b.email || null, note: b.note || null } }, { new: true });
  if (!row) throw new HttpError(404, 'Customer not found');
  res.json(row);
}));

export default r;
