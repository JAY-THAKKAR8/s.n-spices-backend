import { Router } from 'express';
import { query, one } from '../../db.js';
import { asyncH } from '../../lib/utils.js';

const r = Router();

// Dashboard numbers. "Today" uses the database server time zone.
r.get('/stats', asyncH(async (_req, res) => {
  const [k, days, recent, lowStockItems, top] = await Promise.all([
    one(`SELECT
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE created_at >= CURRENT_DATE AND status <> 'CANCELLED') AS sales_today,
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE created_at >= CURRENT_DATE - 1 AND created_at < CURRENT_DATE AND status <> 'CANCELLED') AS sales_yesterday,
      (SELECT COUNT(*)::int FROM orders WHERE created_at >= CURRENT_DATE) AS orders_today,
      (SELECT COUNT(*)::int FROM orders WHERE created_at >= CURRENT_DATE - 1 AND created_at < CURRENT_DATE) AS orders_yesterday,
      (SELECT COUNT(*)::int FROM orders WHERE status = 'PENDING') AS new_orders,
      (SELECT COUNT(*)::int FROM orders WHERE status IN ('CONFIRMED','PACKED')) AS to_pack,
      (SELECT COUNT(*)::int FROM orders WHERE status = 'OUT_FOR_DELIVERY') AS out_for_delivery,
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE payment_status = 'UNPAID' AND status NOT IN ('CANCELLED')) AS unpaid_amount,
      (SELECT COUNT(*)::int FROM orders WHERE payment_status = 'UNPAID' AND status NOT IN ('CANCELLED')) AS unpaid_orders,
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE created_at >= date_trunc('month', now()) AND status <> 'CANCELLED') AS sales_month,
      (SELECT COUNT(*)::int FROM b2b_inquiries WHERE status = 'NEW') AS new_inquiries,
      (SELECT COUNT(*)::int FROM product_variants v JOIN products p ON p.id = v.product_id
         WHERE v.is_active AND p.is_active AND v.stock <= v.low_stock_threshold) AS low_stock,
      (SELECT COUNT(*)::int FROM customers) AS customers`),
    query(`SELECT to_char(d, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(o.total) FILTER (WHERE o.status <> 'CANCELLED'), 0) AS sales,
             COUNT(o.id)::int AS orders
           FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, interval '1 day') d
           LEFT JOIN orders o ON o.created_at >= d AND o.created_at < d + interval '1 day'
           GROUP BY d ORDER BY d`),
    query(`SELECT o.id, o.order_no, o.name, o.city, o.total, o.status, o.payment_method, o.payment_status, o.created_at,
             (SELECT COUNT(*)::int FROM order_items i WHERE i.order_id = o.id) AS item_count
           FROM orders o ORDER BY o.created_at DESC LIMIT 6`),
    query(`SELECT v.id, v.pack_size, v.stock, v.low_stock_threshold, v.sku, p.name_en AS product, p.id AS product_id
           FROM product_variants v JOIN products p ON p.id = v.product_id
           WHERE v.is_active AND p.is_active AND v.stock <= v.low_stock_threshold
           ORDER BY v.stock ASC LIMIT 6`),
    query(`SELECT i.name, i.pack_size, SUM(i.qty)::int AS qty, SUM(i.line_total) AS revenue
           FROM order_items i JOIN orders o ON o.id = i.order_id
           WHERE o.status <> 'CANCELLED' AND o.created_at >= now() - interval '30 days'
           GROUP BY i.name, i.pack_size ORDER BY revenue DESC LIMIT 5`),
  ]);
  res.json({ ...k, days, recent, lowStockItems, top });
}));

// Bell icon: things that need attention
r.get('/notifications', asyncH(async (_req, res) => {
  const [orders, stock, inquiries] = await Promise.all([
    query(`SELECT id, order_no, name, total, created_at FROM orders WHERE status = 'PENDING' ORDER BY created_at DESC LIMIT 5`),
    query(`SELECT v.id, v.pack_size, v.stock, p.name_en AS product FROM product_variants v JOIN products p ON p.id = v.product_id
           WHERE v.is_active AND p.is_active AND v.stock <= v.low_stock_threshold ORDER BY v.stock LIMIT 5`),
    query(`SELECT id, business_name, product, created_at FROM b2b_inquiries WHERE status = 'NEW' ORDER BY created_at DESC LIMIT 5`),
  ]);
  const counts: any = await one(`SELECT
    (SELECT COUNT(*)::int FROM orders WHERE status = 'PENDING') AS orders,
    (SELECT COUNT(*)::int FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.is_active AND p.is_active AND v.stock <= v.low_stock_threshold) AS stock,
    (SELECT COUNT(*)::int FROM b2b_inquiries WHERE status = 'NEW') AS inquiries`);
  res.json({ counts, total: counts.orders + counts.stock + counts.inquiries, orders, stock, inquiries });
}));

// Header search: orders, products, customers
r.get('/search', asyncH(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ orders: [], products: [], customers: [] });
  const like = `%${q}%`;
  const [orders, products, customers] = await Promise.all([
    query(`SELECT id, order_no, name, total, status FROM orders
           WHERE order_no ILIKE $1 OR phone ILIKE $1 OR name ILIKE $1 ORDER BY created_at DESC LIMIT 5`, [like]),
    query(`SELECT DISTINCT p.id, p.name_en, p.slug FROM products p LEFT JOIN product_variants v ON v.product_id = p.id
           WHERE p.name_en ILIKE $1 OR p.name_gu ILIKE $1 OR p.name_hi ILIKE $1 OR v.sku ILIKE $1 LIMIT 5`, [like]),
    query(`SELECT id, name, phone FROM customers WHERE name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1 LIMIT 5`, [like]),
  ]);
  res.json({ orders, products, customers });
}));

export default r;
