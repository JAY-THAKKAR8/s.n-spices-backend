import { Schema, model } from 'mongoose';

export interface B2bInquiryDoc {
  id: number;
  businessName: string;
  phone: string;
  product: string;
  monthlyQty: string;
  cityPincode: string;
  status: 'NEW' | 'CONTACTED' | 'CLOSED';
  createdAt: Date;
}

const b2bInquirySchema = new Schema<B2bInquiryDoc>({
  id: { type: Number, required: true, unique: true },
  businessName: { type: String, required: true, maxlength: 120 },
  phone: { type: String, required: true, maxlength: 15 },
  product: { type: String, required: true, maxlength: 120 },
  monthlyQty: { type: String, required: true, maxlength: 60 },
  cityPincode: { type: String, required: true, maxlength: 120 },
  status: { type: String, enum: ['NEW', 'CONTACTED', 'CLOSED'], required: true, default: 'NEW' },
  createdAt: { type: Date, default: Date.now },
});

export const B2bInquiry = model<B2bInquiryDoc>('B2bInquiry', b2bInquirySchema);
