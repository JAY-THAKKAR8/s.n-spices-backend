-- Extra info for the product details page.
-- List fields are JSON so the admin can add as many rows as needed.

ALTER TABLE products
  ADD COLUMN botanical_name VARCHAR(120),           -- e.g. Elettaria cardamomum
  ADD COLUMN grade          VARCHAR(120),           -- e.g. 8mm bold pods
  ADD COLUMN images         JSONB NOT NULL DEFAULT '[]', -- extra photo URLs ["https://..."]
  ADD COLUMN tags           JSONB NOT NULL DEFAULT '[]', -- short chips ["Strong aroma", "No colour added"]
  ADD COLUMN specs          JSONB NOT NULL DEFAULT '[]', -- [{ "label": "Origin", "value": "Kerala" }]
  ADD COLUMN taste_notes    JSONB NOT NULL DEFAULT '[]', -- [{ "label": "Top note", "text": "Cool, minty", "level": 80 }]
  ADD COLUMN uses           JSONB NOT NULL DEFAULT '[]', -- [{ "title": "Chai", "text": "...", "tip": "..." }]
  ADD COLUMN storage        TEXT;
