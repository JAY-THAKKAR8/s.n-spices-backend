import { Schema, model } from 'mongoose';

export interface Spec { label: string; value: string }
export interface TasteNote { label: string; text: string; level: number }
export interface Use { title: string; text: string; tip?: string }

export interface VariantDoc {
  id: number;
  packSize: string;
  grams: number;
  price: number;
  mrp: number;
  stock: number;
  isActive: boolean;
  sku?: string | null;
  costPrice?: number | null;
  lowStockThreshold: number;
  updatedAt: Date;
}

export interface ProductDoc {
  id: number;
  categoryId: number;
  slug: string;
  nameEn: string;
  nameGu?: string | null;
  nameHi?: string | null;
  description?: string | null;
  highlight?: string | null;
  origin?: string | null;
  badge?: string | null;
  image?: string | null;
  isFeatured: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  botanicalName?: string | null;
  grade?: string | null;
  images: string[];
  tags: string[];
  specs: Spec[];
  tasteNotes: TasteNote[];
  uses: Use[];
  storage?: string | null;
  hsnCode?: string | null;
  gstRate?: number | null;
  scientificName?: string | null;
  details: Record<string, any>;
  variants: VariantDoc[];
}

const variantSchema = new Schema<VariantDoc>({
  id: { type: Number, required: true },
  packSize: { type: String, required: true, maxlength: 30 },
  grams: { type: Number, required: true, default: 0 },
  price: { type: Number, required: true, min: 0.01 },
  mrp: { type: Number, required: true, min: 0.01 },
  stock: { type: Number, required: true, default: 0, min: 0 },
  isActive: { type: Boolean, required: true, default: true },
  sku: { type: String, maxlength: 40, default: null },
  costPrice: { type: Number, default: null },
  lowStockThreshold: { type: Number, required: true, default: 10, min: 0 },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

const productSchema = new Schema<ProductDoc>({
  id: { type: Number, required: true, unique: true },
  categoryId: { type: Number, required: true },
  slug: { type: String, required: true, unique: true, maxlength: 120 },
  nameEn: { type: String, required: true, maxlength: 120 },
  nameGu: { type: String, maxlength: 120, default: null },
  nameHi: { type: String, maxlength: 120, default: null },
  description: { type: String, default: null },
  highlight: { type: String, maxlength: 160, default: null },
  origin: { type: String, maxlength: 80, default: null },
  badge: { type: String, maxlength: 40, default: null },
  image: { type: String, default: null },
  isFeatured: { type: Boolean, required: true, default: false },
  isActive: { type: Boolean, required: true, default: true },
  botanicalName: { type: String, maxlength: 120, default: null },
  grade: { type: String, maxlength: 120, default: null },
  images: { type: [String], default: [] },
  tags: { type: [String], default: [] },
  specs: { type: [{ label: String, value: String }], default: [] },
  tasteNotes: { type: [{ label: String, text: String, level: Number }], default: [] },
  uses: { type: [{ title: String, text: String, tip: String }], default: [] },
  storage: { type: String, default: null },
  hsnCode: { type: String, maxlength: 12, default: null },
  gstRate: { type: Number, default: null },
  scientificName: { type: String, maxlength: 120, default: null },
  details: { type: Schema.Types.Mixed, default: {} },
  variants: { type: [variantSchema], default: [] },
}, { timestamps: true });

productSchema.index({ categoryId: 1 });
productSchema.index({ 'variants.id': 1 });
productSchema.index({ 'variants.sku': 1 }, { unique: true, sparse: true });

export const Product = model<ProductDoc>('Product', productSchema);
