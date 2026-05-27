-- Shop Wise — D1 schema
-- Re-runnable: drops + recreates everything.

PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS list_items;
DROP TABLE IF EXISTS product_locations;
DROP TABLE IF EXISTS aisles;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS retailers;

-- ─────────────────────────────────────────────────────────────────────────
-- retailers
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE retailers (
  id                  TEXT PRIMARY KEY,           -- slug, e.g. "pnp"
  name                TEXT NOT NULL,
  color               TEXT,                       -- brand hex, e.g. "#e30613"
  kind                TEXT NOT NULL DEFAULT 'physical'
                       CHECK (kind IN ('physical','online','hybrid')),
  online_url_template TEXT,                       -- e.g. "https://www.pnp.co.za/"
  position            INTEGER NOT NULL DEFAULT 0, -- display order
  is_default          INTEGER NOT NULL DEFAULT 0, -- 0 or 1 — only one row should be 1
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_retailers_position ON retailers(position);

-- ─────────────────────────────────────────────────────────────────────────
-- aisles (per retailer; absent for online-only retailers)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE aisles (
  id           TEXT PRIMARY KEY,                  -- e.g. "pnp:a3"
  retailer_id  TEXT NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,                     -- "Aisle 3" / "Bakery"
  sub          TEXT,                              -- "Pasta & Rice"
  position     INTEGER NOT NULL DEFAULT 0,        -- store-walk order
  kind         TEXT NOT NULL DEFAULT 'aisle'
                CHECK (kind IN ('aisle','perim')),
  side         TEXT CHECK (side IN ('top','bottom')),  -- perim only
  map_x        REAL,
  map_y        REAL,
  map_w        REAL,
  map_h        REAL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_aisles_retailer ON aisles(retailer_id, position);

-- ─────────────────────────────────────────────────────────────────────────
-- products (master list, retailer-agnostic)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE products (
  id         TEXT PRIMARY KEY,                    -- UUID
  name       TEXT NOT NULL,
  brand      TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_products_name ON products(name COLLATE NOCASE);

-- ─────────────────────────────────────────────────────────────────────────
-- product_locations — the matrix (which aisle at which retailer, what price)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE product_locations (
  id               TEXT PRIMARY KEY,
  product_id       TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  retailer_id      TEXT NOT NULL REFERENCES retailers(id) ON DELETE CASCADE,
  aisle_id         TEXT REFERENCES aisles(id) ON DELETE SET NULL,
  indicative_price REAL,
  is_primary       INTEGER NOT NULL DEFAULT 0,  -- if 1, this retailer is the "default" for the product
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, retailer_id)
);
CREATE INDEX idx_locations_product ON product_locations(product_id);
CREATE INDEX idx_locations_retailer ON product_locations(retailer_id);

-- ─────────────────────────────────────────────────────────────────────────
-- list_items — the live shopping list (single shared list this phase)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE list_items (
  id                TEXT PRIMARY KEY,           -- UUID
  name              TEXT NOT NULL,              -- denormalised
  product_id        TEXT REFERENCES products(id) ON DELETE SET NULL,
  retailer_id       TEXT REFERENCES retailers(id) ON DELETE SET NULL,
  aisle_id          TEXT REFERENCES aisles(id) ON DELETE SET NULL,
  checked           INTEGER NOT NULL DEFAULT 0,
  fulfilment_mode   TEXT NOT NULL DEFAULT 'in_store'
                     CHECK (fulfilment_mode IN ('in_store','online')),
  online_order_link TEXT,
  external_status   TEXT,                       -- "ordered"|"delivered"|NULL
  source            TEXT NOT NULL DEFAULT 'manual'
                     CHECK (source IN ('manual','pre-do')),
  source_action_id  TEXT,
  source_inbox_id   TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_list_retailer ON list_items(retailer_id);
CREATE INDEX idx_list_source_action ON list_items(source_action_id);
CREATE INDEX idx_list_checked ON list_items(checked);
