import { Router } from 'express';
import { Order, Product, Customer, B2bInquiry } from '../../models/index.js';
import { asyncH } from '../../lib/utils.js';

const r = Router();

const LOW_STOCK_MATCH = { 'variants.isActive': true, $expr: { $lte: ['$variants.stock', '$variants.lowStockThreshold'] } };

async function lowStockCount() {
  const [row] = await Product.aggregate([
    { $match: { isActive: true } },
    { $unwind: '$variants' },
    { $match: LOW_STOCK_MATCH },
    { $count: 'n' },
  ]);
  return row?.n || 0;
}

// Dashboard numbers. "Today" is midnight UTC, same cutoff used everywhere here.
r.get('/stats', asyncH(async (_req, res) => {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const sevenStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  const thirtyAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const sumSince = (gte: Date, lt?: Date) =>
    Order.aggregate([
      { $match: { createdAt: lt ? { $gte: gte, $lt: lt } : { $gte: gte }, status: { $ne: 'CANCELLED' } } },
      { $group: { _id: null, sum: { $sum: '$total' } } },
    ]).then((r) => r[0]?.sum || 0);

  const [
    salesToday, salesYesterday, ordersToday, ordersYesterday, newOrders, toPack, outForDelivery,
    unpaid, salesMonth, newInquiries, lowStock, customers, dayAgg, recentOrders, lowStockItems, top,
  ] = await Promise.all([
    sumSince(todayStart),
    sumSince(yesterdayStart, todayStart),
    Order.countDocuments({ createdAt: { $gte: todayStart } }),
    Order.countDocuments({ createdAt: { $gte: yesterdayStart, $lt: todayStart } }),
    Order.countDocuments({ status: 'PENDING' }),
    Order.countDocuments({ status: { $in: ['CONFIRMED', 'PACKED'] } }),
    Order.countDocuments({ status: 'OUT_FOR_DELIVERY' }),
    Order.aggregate([
      { $match: { paymentStatus: 'UNPAID', status: { $ne: 'CANCELLED' } } },
      { $group: { _id: null, sum: { $sum: '$total' }, n: { $sum: 1 } } },
    ]).then((r) => r[0] || { sum: 0, n: 0 }),
    sumSince(monthStart),
    B2bInquiry.countDocuments({ status: 'NEW' }),
    lowStockCount(),
    Customer.countDocuments(),
    Order.aggregate([
      { $match: { createdAt: { $gte: sevenStart } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
          sales: { $sum: { $cond: [{ $ne: ['$status', 'CANCELLED'] }, '$total', 0] } },
          orders: { $sum: 1 },
        },
      },
    ]),
    Order.find({}, { id: 1, orderNo: 1, name: 1, city: 1, total: 1, status: 1, paymentMethod: 1, paymentStatus: 1, createdAt: 1, items: 1 })
      .sort({ createdAt: -1 }).limit(6).lean(),
    Product.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$variants' },
      { $match: LOW_STOCK_MATCH },
      { $project: { _id: 0, id: '$variants.id', packSize: '$variants.packSize', stock: '$variants.stock', lowStockThreshold: '$variants.lowStockThreshold', sku: '$variants.sku', product: '$nameEn', productId: '$id' } },
      { $sort: { stock: 1 } },
      { $limit: 6 },
    ]),
    Order.aggregate([
      { $match: { status: { $ne: 'CANCELLED' }, createdAt: { $gte: thirtyAgo } } },
      { $unwind: '$items' },
      { $group: { _id: { name: '$items.name', packSize: '$items.packSize' }, qty: { $sum: '$items.qty' }, revenue: { $sum: '$items.lineTotal' } } },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
      { $project: { _id: 0, name: '$_id.name', packSize: '$_id.packSize', qty: 1, revenue: 1 } },
    ]),
  ]);

  const dayMap = new Map(dayAgg.map((d: any) => [d._id, d]));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sevenStart.getTime() + i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    const row = dayMap.get(key);
    days.push({ day: key, sales: row?.sales || 0, orders: row?.orders || 0 });
  }
  const recent = recentOrders.map((o) => ({ ...o, itemCount: o.items.length, items: undefined }));

  res.json({
    salesToday, salesYesterday, ordersToday, ordersYesterday, newOrders, toPack, outForDelivery,
    unpaidAmount: unpaid.sum, unpaidOrders: unpaid.n, salesMonth, newInquiries, lowStock, customers,
    days, recent, lowStockItems, top,
  });
}));

// Bell icon: things that need attention
r.get('/notifications', asyncH(async (_req, res) => {
  const [orders, stock, inquiries, orderCount, stockCount, inquiryCount] = await Promise.all([
    Order.find({ status: 'PENDING' }, { id: 1, orderNo: 1, name: 1, total: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(5).lean(),
    Product.aggregate([
      { $match: { isActive: true } },
      { $unwind: '$variants' },
      { $match: LOW_STOCK_MATCH },
      { $project: { _id: 0, id: '$variants.id', packSize: '$variants.packSize', stock: '$variants.stock', product: '$nameEn' } },
      { $sort: { stock: 1 } },
      { $limit: 5 },
    ]),
    B2bInquiry.find({ status: 'NEW' }, { id: 1, businessName: 1, product: 1, createdAt: 1 }).sort({ createdAt: -1 }).limit(5).lean(),
    Order.countDocuments({ status: 'PENDING' }),
    lowStockCount(),
    B2bInquiry.countDocuments({ status: 'NEW' }),
  ]);
  const counts = { orders: orderCount, stock: stockCount, inquiries: inquiryCount };
  res.json({ counts, total: counts.orders + counts.stock + counts.inquiries, orders, stock, inquiries });
}));

// Header search: orders, products, customers
r.get('/search', asyncH(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ orders: [], products: [], customers: [] });
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const [orders, products, customers] = await Promise.all([
    Order.find({ $or: [{ orderNo: re }, { phone: re }, { name: re }] }, { id: 1, orderNo: 1, name: 1, total: 1, status: 1 })
      .sort({ createdAt: -1 }).limit(5).lean(),
    Product.find({ $or: [{ nameEn: re }, { nameGu: re }, { nameHi: re }, { 'variants.sku': re }] }, { id: 1, nameEn: 1, slug: 1 }).limit(5).lean(),
    Customer.find({ $or: [{ name: re }, { phone: re }, { email: re }] }, { id: 1, name: 1, phone: 1 }).limit(5).lean(),
  ]);
  res.json({ orders, products, customers });
}));

export default r;
