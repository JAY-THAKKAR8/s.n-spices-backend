import type { QueryFilter } from 'mongoose';
import { Order } from '../models/index.js';
import type { OrderDoc } from '../models/index.js';

// Load orders (items are already embedded on each order doc).
export async function loadOrders(filter: QueryFilter<OrderDoc> = {}, limit = 200) {
  return Order.find(filter).sort({ createdAt: -1 }).limit(limit).lean<OrderDoc[]>();
}
