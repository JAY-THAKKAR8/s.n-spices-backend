import { Schema, model } from 'mongoose';

export interface AdminDoc {
  id: number;
  name: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'STAFF';
  createdAt: Date;
}

const adminSchema = new Schema<AdminDoc>({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, maxlength: 120 },
  password: { type: String, required: true },
  role: { type: String, enum: ['ADMIN', 'STAFF'], required: true, default: 'ADMIN' },
  createdAt: { type: Date, default: Date.now },
});

export const Admin = model<AdminDoc>('Admin', adminSchema);
