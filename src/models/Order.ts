import { Schema, model } from 'mongoose';

export interface OrderItemDoc {
  id: number;
  variantId: number;
  name: string;
  packSize: string;
  price: number;
  qty: number;
  lineTotal: number;
}

export interface OrderEventDoc {
  id: number;
  kind: 'STATUS' | 'PAYMENT' | 'NOTE' | 'SHIPPING';
  status?: string | null;
  message?: string | null;
  adminId?: number | null;
  createdAt: Date;
}

export const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'] as const;

export interface OrderDoc {
  id: number;
  orderNo: string;
  customerId: number;
  name: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
  note?: string | null;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  couponId?: number | null;
  paymentMethod: 'COD' | 'WHATSAPP' | 'ONLINE';
  paymentStatus: 'UNPAID' | 'PAID' | 'REFUNDED';
  status: typeof ORDER_STATUSES[number];
  courier?: string | null;
  trackingNo?: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemDoc[];
  events: OrderEventDoc[];
}

const orderItemSchema = new Schema<OrderItemDoc>({
  id: { type: Number, required: true },
  variantId: { type: Number, required: true },
  name: { type: String, required: true, maxlength: 120 },
  packSize: { type: String, required: true, maxlength: 30 },
  price: { type: Number, required: true },
  qty: { type: Number, required: true, min: 1 },
  lineTotal: { type: Number, required: true },
}, { _id: false });

const orderEventSchema = new Schema<OrderEventDoc>({
  id: { type: Number, required: true },
  kind: { type: String, enum: ['STATUS', 'PAYMENT', 'NOTE', 'SHIPPING'], required: true },
  status: { type: String, default: null },
  message: { type: String, maxlength: 500, default: null },
  adminId: { type: Number, default: null },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const orderSchema = new Schema<OrderDoc>({
  id: { type: Number, required: true, unique: true },
  orderNo: { type: String, required: true, unique: true, maxlength: 30 },
  customerId: { type: Number, required: true },
  name: { type: String, required: true, maxlength: 80 },
  phone: { type: String, required: true, maxlength: 15 },
  address: { type: String, required: true, maxlength: 300 },
  city: { type: String, required: true, maxlength: 60 },
  pincode: { type: String, required: true, maxlength: 6 },
  note: { type: String, maxlength: 300, default: null },
  subtotal: { type: Number, required: true },
  discount: { type: Number, required: true, default: 0 },
  deliveryFee: { type: Number, required: true, default: 0 },
  total: { type: Number, required: true },
  couponId: { type: Number, default: null },
  paymentMethod: { type: String, enum: ['COD', 'WHATSAPP', 'ONLINE'], required: true },
  paymentStatus: { type: String, enum: ['UNPAID', 'PAID', 'REFUNDED'], required: true, default: 'UNPAID' },
  status: { type: String, enum: ORDER_STATUSES, required: true, default: 'PENDING' },
  courier: { type: String, maxlength: 60, default: null },
  trackingNo: { type: String, maxlength: 60, default: null },
  items: { type: [orderItemSchema], default: [] },
  events: { type: [orderEventSchema], default: [] },
}, { timestamps: true });

orderSchema.index({ phone: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ customerId: 1 });
orderSchema.index({ 'items.variantId': 1 });

export const Order = model<OrderDoc>('Order', orderSchema);
