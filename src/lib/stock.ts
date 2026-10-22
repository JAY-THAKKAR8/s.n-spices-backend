import type { ClientSession } from 'mongoose';
import { Product, StockMovement, Order } from '../models/index.js';
import type { VariantDoc, StockMovementDoc, OrderEventDoc } from '../models/index.js';
import { nextId } from '../db.js';
import { HttpError } from './utils.js';

export interface MoveStockArgs {
  variantId: number;
  change: number;
  type: StockMovementDoc['type'];
  note?: string | null;
  orderId?: number | null;
  adminId?: number | null;
}

// Change stock of one pack and log it. Must run inside a transaction session.
// change: +n or -n. Fails if stock would go below 0.
export async function moveStock(session: ClientSession, { variantId, change, type, note = null, orderId = null, adminId = null }: MoveStockArgs) {
  const updated = await Product.findOneAndUpdate(
    { 'variants.id': variantId, 'variants.stock': { $gte: -change } },
    { $inc: { 'variants.$.stock': change }, $set: { 'variants.$.updatedAt': new Date() } },
    { new: true, session },
  );
  if (!updated) return null; // not enough stock (caller decides the error)
  const variant = updated.variants.find((v: VariantDoc) => v.id === variantId)!;
  const id = await nextId('stockMovement', session);
  await StockMovement.create([{ id, variantId, change, balanceAfter: variant.stock, type, note, orderId, adminId }], { session });
  return variant.stock;
}

export interface SetStockArgs {
  variantId: number;
  value: number;
  type?: StockMovementDoc['type'];
  note?: string | null;
  adminId?: number | null;
}

// Set stock to an exact number (stock count / edit form).
export async function setStock(session: ClientSession, { variantId, value, type = 'SET', note = null, adminId = null }: SetStockArgs) {
  const p = await Product.findOne({ 'variants.id': variantId }, { variants: { $elemMatch: { id: variantId } } }, { session });
  const cur = p?.variants?.[0];
  if (!cur) throw new HttpError(404, 'Pack not found');
  const change = value - cur.stock;
  if (change === 0) return cur.stock;
  return moveStock(session, { variantId, change, type, note, adminId });
}

export interface AddOrderEventArgs {
  orderId: number;
  kind: OrderEventDoc['kind'];
  status?: string | null;
  message?: string | null;
  adminId?: number | null;
}

export async function addOrderEvent(session: ClientSession, { orderId, kind, status = null, message = null, adminId = null }: AddOrderEventArgs) {
  const id = await nextId('orderEvent', session);
  await Order.updateOne(
    { id: orderId },
    { $push: { events: { id, kind, status, message, adminId, createdAt: new Date() } } },
    { session },
  );
}
