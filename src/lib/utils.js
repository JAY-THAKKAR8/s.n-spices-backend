// Small shared helpers

export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const money = (n) => Math.round(Number(n) * 100) / 100;

// Product row (with variants array) -> API shape
export const shapeProduct = (p, lang = 'en') => {
  const variants = (p.variants || []).map((v) => ({
    id: v.id,
    packSize: v.pack_size ?? v.packSize,
    grams: v.grams,
    price: Number(v.price),
    mrp: Number(v.mrp),
    stock: v.stock,
    isActive: v.is_active ?? v.isActive,
  }));
  const first = variants[0];
  return {
    id: p.id,
    slug: p.slug,
    name: (lang === 'gu' && p.nameGu) || (lang === 'hi' && p.nameHi) || p.nameEn,
    nameEn: p.nameEn,
    nameGu: p.nameGu,
    nameHi: p.nameHi,
    description: p.description,
    highlight: p.highlight,
    origin: p.origin,
    badge: p.badge,
    image: p.image,
    images: [p.image, ...(p.images || [])].filter(Boolean),
    extraImages: p.images || [],
    botanicalName: p.botanicalName,
    grade: p.grade,
    tags: p.tags || [],
    specs: p.specs || [],
    tasteNotes: p.tasteNotes || [],
    uses: p.uses || [],
    storage: p.storage,
    isFeatured: p.isFeatured,
    isActive: p.isActive,
    categoryId: p.categoryId,
    category: p.categorySlug ? { id: p.categoryId, slug: p.categorySlug, name: p.categoryName } : undefined,
    variants,
    minPrice: variants.length ? Math.min(...variants.map((v) => v.price)) : null,
    discountPct: first && first.mrp > first.price ? Math.round(((first.mrp - first.price) / first.mrp) * 100) : 0,
  };
};

export const makeOrderNo = () => {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `SN-${ymd}-${Math.floor(1000 + Math.random() * 9000)}`;
};
