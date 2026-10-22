import { Schema, model } from 'mongoose';

export interface CustomerDoc {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  note?: string | null;
  createdAt: Date;
}

const customerSchema = new Schema<CustomerDoc>({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true, maxlength: 80 },
  phone: { type: String, required: true, unique: true, maxlength: 15 },
  email: { type: String, maxlength: 120, default: null },
  note: { type: String, maxlength: 300, default: null },
  createdAt: { type: Date, default: Date.now },
});

export const Customer = model<CustomerDoc>('Customer', customerSchema);
