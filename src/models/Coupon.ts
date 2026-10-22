import { Schema, model } from 'mongoose';

export interface CouponDoc {
  id: number;
  code: string;
  type: 'PERCENT' | 'FLAT';
  value: number;
  minOrder: number;
  maxOff?: number | null;
  validTill?: Date | null;
  isActive: boolean;
}

const couponSchema = new Schema<CouponDoc>({
  id: { type: Number, required: true, unique: true },
  code: { type: String, required: true, unique: true, maxlength: 30 },
  type: { type: String, enum: ['PERCENT', 'FLAT'], required: true },
  value: { type: Number, required: true },
  minOrder: { type: Number, required: true, default: 0 },
  maxOff: { type: Number, default: null },
  validTill: { type: Date, default: null },
  isActive: { type: Boolean, required: true, default: true },
});

export const Coupon = model<CouponDoc>('Coupon', couponSchema);
