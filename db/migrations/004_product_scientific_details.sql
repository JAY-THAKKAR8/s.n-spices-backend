-- Admin product editor writes scientific name + a flexible content blob
-- (facts/profile/tags/uses/compare/faqs/storage/shelfLife). These columns
-- were used by the admin API/UI but never migrated.

ALTER TABLE products
  ADD COLUMN scientific_name VARCHAR(120),
  ADD COLUMN details         JSONB NOT NULL DEFAULT '{}'::jsonb;
