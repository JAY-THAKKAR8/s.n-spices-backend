import { Schema, model } from 'mongoose';

export interface CategoryDoc {
  id: number;
  slug: string;
  nameEn: string;
  nameGu?: string | null;
  nameHi?: string | null;
  subtitle?: string | null;
  tag?: string | null;
  image?: string | null;
  sortOrder: number;
  isActive: boolean;
}

const categorySchema = new Schema<CategoryDoc>({
  id: { type: Number, required: true, unique: true },
  slug: { type: String, required: true, unique: true, maxlength: 80 },
  nameEn: { type: String, required: true, maxlength: 80 },
  nameGu: { type: String, maxlength: 80, default: null },
  nameHi: { type: String, maxlength: 80, default: null },
  subtitle: { type: String, maxlength: 120, default: null },
  tag: { type: String, maxlength: 40, default: null },
  image: { type: String, default: null },
  sortOrder: { type: Number, required: true, default: 0 },
  isActive: { type: Boolean, required: true, default: true },
});

export const Category = model<CategoryDoc>('Category', categorySchema);
