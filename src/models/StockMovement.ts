import { Schema, model } from 'mongoose';

export interface StockMovementDoc {
  id: number;
  variantId: number;
  change: number;
  balanceAfter: number;
  type: 'INWARD' | 'DEDUCT' | 'SET' | 'ORDER' | 'CANCEL' | 'EDIT';
  note?: string | null;
  orderId?: number | null;
  adminId?: number | null;
  createdAt: Date;
}

const stockMovementSchema = new Schema<StockMovementDoc>({
  id: { type: Number, required: true, unique: true },
  variantId: { type: Number, required: true },
  change: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  type: { type: String, enum: ['INWARD', 'DEDUCT', 'SET', 'ORDER', 'CANCEL', 'EDIT'], required: true },
  note: { type: String, maxlength: 200, default: null },
  orderId: { type: Number, default: null },
  adminId: { type: Number, default: null },
  createdAt: { type: Date, default: Date.now },
});

stockMovementSchema.index({ variantId: 1, createdAt: -1 });
stockMovementSchema.index({ createdAt: -1 });

export const StockMovement = model<StockMovementDoc>('StockMovement', stockMovementSchema);
