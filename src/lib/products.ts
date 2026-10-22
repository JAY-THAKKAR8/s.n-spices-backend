import type { QueryFilter, SortOrder } from 'mongoose';
import { Product, Category } from '../models/index.js';
import type { ProductDoc, CategoryDoc } from '../models/index.js';
import { shapeProduct } from './utils.js';

export interface LoadProductsOptions {
  filter?: QueryFilter<ProductDoc>;
  sort?: Record<string, SortOrder>;
  onlyActiveVariants?: boolean;
  lang?: string;
}

// Load products (with their variants already embedded) and attach category info.
export async function loadProducts({
  filter = {},
  sort = { isFeatured: -1, id: 1 },
  onlyActiveVariants = true,
  lang = 'en',
}: LoadProductsOptions = {}) {
  const docs = await Product.find(filter).sort(sort).lean<ProductDoc[]>();
  const categories = await Category.find({}, { id: 1, slug: 1, nameEn: 1 }).lean<CategoryDoc[]>();
  const catById = new Map(categories.map((c) => [c.id, c]));

  return docs.map((p) => {
    const cat = catById.get(p.categoryId);
    const variants = onlyActiveVariants ? p.variants.filter((v) => v.isActive) : p.variants;
    return shapeProduct(
      {
        ...p,
        variants: [...variants].sort((a, b) => a.grams - b.grams || a.id - b.id),
        categorySlug: cat?.slug,
        categoryName: cat?.nameEn,
      },
      lang,
    );
  });
}
