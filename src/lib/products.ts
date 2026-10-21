import { query } from '../db.js';
import { shapeProduct } from './utils.js';

export interface LoadProductsOptions {
  where?: string;
  params?: any[];
  orderBy?: string;
  onlyActiveVariants?: boolean;
  lang?: string;
  admin?: boolean;
}

// Load products with their variants in one query.
// where: SQL after WHERE using alias p (products) and c (categories).
// onlyActiveVariants: hide inactive packs (shop side).
export async function loadProducts({
  where = 'TRUE',
  params = [],
  orderBy = 'p.is_featured DESC, p.id ASC',
  onlyActiveVariants = true,
  lang = 'en',
}: LoadProductsOptions = {}) {
  const rows = await query(
    `SELECT p.*, c.slug AS category_slug, c.name_en AS category_name,
       COALESCE(json_agg(v ORDER BY v.grams, v.id) FILTER (WHERE v.id IS NOT NULL), '[]') AS variants
     FROM products p
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN product_variants v ON v.product_id = p.id ${onlyActiveVariants ? 'AND v.is_active' : ''}
     WHERE ${where}
     GROUP BY p.id, c.slug, c.name_en
     ORDER BY ${orderBy}`,
    params,
  );
  return rows.map((p: any) => shapeProduct(p, lang));
}
