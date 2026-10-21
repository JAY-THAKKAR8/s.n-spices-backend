import { one, query } from '../db.js';
import { HttpError, money } from './utils.js';

const FREE_MIN = () => Number(process.env.FREE_DELIVERY_MIN || 499);
const FEE = () => Number(process.env.DELIVERY_FEE || 40);

// Check coupon for a subtotal. Returns { coupon, discount } or throws.
export async function applyCoupon(code: string | null | undefined, subtotal: number) {
  if (!code) return { coupon: null, discount: 0 };
  const c: any = await one('SELECT * FROM coupons WHERE code = $1', [String(code).trim().toUpperCase()]);
  if (!c || !c.isActive) throw new HttpError(400, 'Invalid coupon code');
  if (c.validTill && new Date(c.validTill) < new Date()) throw new HttpError(400, 'Coupon expired');
  if (subtotal < c.minOrder) throw new HttpError(400, `Add items worth ₹${c.minOrder} to use this coupon`);
  let discount = c.type === 'PERCENT' ? (subtotal * c.value) / 100 : c.value;
  if (c.maxOff) discount = Math.min(discount, c.maxOff);
  return { coupon: c, discount: money(Math.min(discount, subtotal)) };
}

export interface CartItem {
  variantId: number;
  qty: number;
}

// Price a cart from DB prices. Never trust prices sent by the browser.
export async function priceCart(items: CartItem[], couponCode?: string | null) {
  if (!items?.length) throw new HttpError(400, 'Cart is empty');

  // merge duplicate lines
  const qtyById: Record<number, number> = {};
  for (const i of items) qtyById[i.variantId] = (qtyById[i.variantId] || 0) + i.qty;
  const ids = Object.keys(qtyById).map(Number);

  const rows: any[] = await query(
    `SELECT v.*, p.name_en AS product_name, p.image, p.slug
     FROM product_variants v JOIN products p ON p.id = v.product_id
     WHERE v.id = ANY($1) AND v.is_active AND p.is_active`,
    [ids],
  );
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  const lines = ids.map((variantId) => {
    const v = byId[variantId];
    const qty = qtyById[variantId];
    if (!v) throw new HttpError(400, 'Some items are no longer available. Please refresh your cart.');
    if (v.stock < qty) throw new HttpError(400, `Only ${v.stock} left for ${v.productName} (${v.packSize})`);
    return {
      variantId,
      name: v.productName,
      slug: v.slug,
      image: v.image,
      packSize: v.packSize,
      price: v.price,
      mrp: v.mrp,
      qty,
      lineTotal: money(v.price * qty),
    };
  });

  const subtotal = money(lines.reduce((s, l) => s + l.lineTotal, 0));
  const mrpTotal = money(lines.reduce((s, l) => s + l.mrp * l.qty, 0));
  const { coupon, discount } = await applyCoupon(couponCode, subtotal);
  const deliveryFee = subtotal >= FREE_MIN() ? 0 : FEE();
  const total = money(subtotal - discount + deliveryFee);

  return { lines, subtotal, mrpTotal, discount, deliveryFee, total, coupon };
}
