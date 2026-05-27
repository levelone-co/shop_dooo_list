-- Shop Wise — seed data
-- Pre-seeded retailers, aisle layouts, products, and per-retailer product locations.
-- Re-run with: npm run db:seed:local

-- ─────────────────────────────────────────────────────────────────────────
-- Retailers
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO retailers (id, name, color, kind, online_url_template, position, is_default) VALUES
  ('pnp',         'Pick n Pay',     '#005baa', 'physical', NULL,                              10, 1),
  ('checkers',    'Checkers',       '#e30613', 'hybrid',   'https://www.checkers.co.za/',     20, 0),
  ('woolworths',  'Woolworths',     '#000000', 'hybrid',   'https://www.woolworths.co.za/',   30, 0),
  ('takealot',    'Takealot',       '#0080ff', 'online',   'https://www.takealot.com/',       40, 0),
  ('amazon-coza', 'Amazon.co.za',   '#ff9900', 'online',   'https://www.amazon.co.za/',       50, 0),
  ('other',       'Other',          '#6b7280', 'physical', NULL,                              99, 0);

-- ─────────────────────────────────────────────────────────────────────────
-- Aisles — Pick n Pay (current Shop Wise layout)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO aisles (id, retailer_id, name, sub, position, kind, side, map_x, map_y, map_w, map_h) VALUES
  ('pnp:produce',  'pnp', 'Produce',  NULL,           1, 'aisle', NULL,   10, 64,  20, 192),
  ('pnp:a1',       'pnp', 'Aisle 1',  'Snacks',       2, 'aisle', NULL,   32, 64,  20, 192),
  ('pnp:a2',       'pnp', 'Aisle 2',  'Cereals',      3, 'aisle', NULL,   54, 64,  20, 192),
  ('pnp:a3',       'pnp', 'Aisle 3',  'Canned',       4, 'aisle', NULL,   76, 64,  20, 192),
  ('pnp:a4',       'pnp', 'Aisle 4',  'Pasta & Rice', 5, 'aisle', NULL,   98, 64,  20, 192),
  ('pnp:a5',       'pnp', 'Aisle 5',  'Cleaning',     6, 'aisle', NULL,  120, 64,  20, 192),
  ('pnp:bakery',   'pnp', 'Bakery',   NULL,           7, 'perim', 'top',  10, 10,  60,  40),
  ('pnp:a6',       'pnp', 'Aisle 6',  'Toiletries',   8, 'aisle', NULL,  142, 64,  20, 192),
  ('pnp:a7',       'pnp', 'Aisle 7',  'Beverages',    9, 'aisle', NULL,  164, 64,  20, 192),
  ('pnp:a8',       'pnp', 'Aisle 8',  'Baby & Pet',  10, 'aisle', NULL,  186, 64,  20, 192),
  ('pnp:deli',     'pnp', 'Deli',     NULL,          11, 'perim', 'top',  80, 10,  60,  40),
  ('pnp:butchery', 'pnp', 'Butchery', NULL,          12, 'perim', 'top', 150, 10,  60,  40),
  ('pnp:dairy',    'pnp', 'Dairy',    NULL,          13, 'perim', 'bottom', 10, 270, 80, 40),
  ('pnp:frozen',   'pnp', 'Frozen',   NULL,          14, 'perim', 'bottom',100, 270, 50, 40),
  ('pnp:checkout', 'pnp', 'Checkout', NULL,          15, 'perim', 'bottom',160, 270, 50, 40);

-- ─────────────────────────────────────────────────────────────────────────
-- Aisles — Checkers (mirror — Produce on the right side)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO aisles (id, retailer_id, name, sub, position, kind, side, map_x, map_y, map_w, map_h) VALUES
  ('chk:a1',       'checkers', 'Aisle 1', 'Snacks',       1, 'aisle', NULL,   10, 64,  20, 192),
  ('chk:a2',       'checkers', 'Aisle 2', 'Cereals',      2, 'aisle', NULL,   32, 64,  20, 192),
  ('chk:a3',       'checkers', 'Aisle 3', 'Canned',       3, 'aisle', NULL,   54, 64,  20, 192),
  ('chk:a4',       'checkers', 'Aisle 4', 'Pasta & Rice', 4, 'aisle', NULL,   76, 64,  20, 192),
  ('chk:a5',       'checkers', 'Aisle 5', 'Cleaning',     5, 'aisle', NULL,   98, 64,  20, 192),
  ('chk:a6',       'checkers', 'Aisle 6', 'Toiletries',   6, 'aisle', NULL,  120, 64,  20, 192),
  ('chk:a7',       'checkers', 'Aisle 7', 'Beverages',    7, 'aisle', NULL,  142, 64,  20, 192),
  ('chk:bakery',   'checkers', 'Bakery',   NULL,          8, 'perim','top',   10, 10,  60,  40),
  ('chk:a8',       'checkers', 'Aisle 8', 'Baby & Pet',   9, 'aisle', NULL,  164, 64,  20, 192),
  ('chk:produce',  'checkers', 'Produce', NULL,          10, 'aisle', NULL,  186, 64,  20, 192),
  ('chk:deli',     'checkers', 'Deli',     NULL,         11, 'perim','top',   80, 10,  60,  40),
  ('chk:butchery', 'checkers', 'Butchery', NULL,         12, 'perim','top',  150, 10,  60,  40),
  ('chk:dairy',    'checkers', 'Dairy',    NULL,         13, 'perim','bottom', 10, 270, 80, 40),
  ('chk:frozen',   'checkers', 'Frozen',   NULL,         14, 'perim','bottom',100, 270, 50, 40),
  ('chk:checkout', 'checkers', 'Checkout', NULL,         15, 'perim','bottom',160, 270, 50, 40);

-- ─────────────────────────────────────────────────────────────────────────
-- Aisles — Woolworths (smaller boutique layout)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO aisles (id, retailer_id, name, sub, position, kind, side, map_x, map_y, map_w, map_h) VALUES
  ('wool:bakery',    'woolworths', 'Bakery',       NULL,        1, 'perim','top',   10, 10,  60,  40),
  ('wool:foodhall',  'woolworths', 'Food Hall',    'Prepared',  2, 'perim','top',   80, 10, 130,  40),
  ('wool:fresh',     'woolworths', 'Fresh',        'Produce',   3, 'aisle', NULL,   10, 64,  40, 192),
  ('wool:butchery',  'woolworths', 'Butchery',     NULL,        4, 'aisle', NULL,   55, 64,  35, 192),
  ('wool:deli',      'woolworths', 'Deli',         NULL,        5, 'aisle', NULL,   95, 64,  35, 192),
  ('wool:pantry',    'woolworths', 'Pantry',       'Dry goods', 6, 'aisle', NULL,  135, 64,  40, 192),
  ('wool:beverages', 'woolworths', 'Beverages',    NULL,        7, 'aisle', NULL,  180, 64,  30, 192),
  ('wool:dairy',     'woolworths', 'Dairy',        NULL,        8, 'perim','bottom',10, 270, 80, 40),
  ('wool:frozen',    'woolworths', 'Frozen',       NULL,        9, 'perim','bottom',100, 270, 50, 40),
  ('wool:checkout',  'woolworths', 'Checkout',     NULL,       10, 'perim','bottom',160, 270, 50, 40);

-- ─────────────────────────────────────────────────────────────────────────
-- Products
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO products (id, name) VALUES
  ('prod-bananas',          'Bananas'),
  ('prod-apples',           'Apples'),
  ('prod-tomatoes',         'Tomatoes'),
  ('prod-onions',           'Onions'),
  ('prod-bread',            'Bread'),
  ('prod-eggs',             'Eggs'),
  ('prod-niknaks',          'NikNaks'),
  ('prod-simba-chips',      'Simba Chips'),
  ('prod-beacon-chocolate', 'Beacon Chocolate'),
  ('prod-jungle-oats',      'Jungle Oats'),
  ('prod-pronutro',         'ProNutro'),
  ('prod-koo-baked-beans',  'Koo Baked Beans'),
  ('prod-lucky-star',       'Lucky Star Pilchards'),
  ('prod-tastic-rice',      'Tastic Rice'),
  ('prod-fattis-pasta',     'Fatti''s Pasta'),
  ('prod-sunlight-dish',    'Sunlight Dishwash'),
  ('prod-handy-andy',       'Handy Andy'),
  ('prod-colgate',          'Colgate Toothpaste'),
  ('prod-dove-soap',        'Dove Soap'),
  ('prod-coca-cola',        'Coca-Cola'),
  ('prod-rooibos-tea',      'Rooibos Tea'),
  ('prod-five-roses',       'Five Roses Tea'),
  ('prod-purity',           'Purity Baby Food'),
  ('prod-pampers',          'Pampers'),
  ('prod-chappies',         'Chappies'),
  ('prod-russians',         'Russians'),
  ('prod-mince',            'Mince'),
  ('prod-chicken',          'Chicken'),
  ('prod-milk',             'Milk'),
  ('prod-yoghurt',          'Yoghurt'),
  ('prod-whipped-cream',    'Whipped Cream'),
  ('prod-frozen-peas',      'Frozen Peas');

-- ─────────────────────────────────────────────────────────────────────────
-- Product locations — Pick n Pay (PRIMARY for every product)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO product_locations (id, product_id, retailer_id, aisle_id, is_primary) VALUES
  ('loc-pnp-bananas',          'prod-bananas',          'pnp', 'pnp:produce',  1),
  ('loc-pnp-apples',           'prod-apples',           'pnp', 'pnp:produce',  1),
  ('loc-pnp-tomatoes',         'prod-tomatoes',         'pnp', 'pnp:produce',  1),
  ('loc-pnp-onions',           'prod-onions',           'pnp', 'pnp:produce',  1),
  ('loc-pnp-bread',            'prod-bread',            'pnp', 'pnp:bakery',   1),
  ('loc-pnp-eggs',             'prod-eggs',             'pnp', 'pnp:dairy',    1),
  ('loc-pnp-niknaks',          'prod-niknaks',          'pnp', 'pnp:a1',       1),
  ('loc-pnp-simba',            'prod-simba-chips',      'pnp', 'pnp:a1',       1),
  ('loc-pnp-beacon',           'prod-beacon-chocolate', 'pnp', 'pnp:a1',       1),
  ('loc-pnp-jungle',           'prod-jungle-oats',      'pnp', 'pnp:a2',       1),
  ('loc-pnp-pronutro',         'prod-pronutro',         'pnp', 'pnp:a2',       1),
  ('loc-pnp-koo',              'prod-koo-baked-beans',  'pnp', 'pnp:a3',       1),
  ('loc-pnp-lucky',            'prod-lucky-star',       'pnp', 'pnp:a3',       1),
  ('loc-pnp-tastic',           'prod-tastic-rice',      'pnp', 'pnp:a4',       1),
  ('loc-pnp-fattis',           'prod-fattis-pasta',     'pnp', 'pnp:a4',       1),
  ('loc-pnp-sunlight',         'prod-sunlight-dish',    'pnp', 'pnp:a5',       1),
  ('loc-pnp-handyandy',        'prod-handy-andy',       'pnp', 'pnp:a5',       1),
  ('loc-pnp-colgate',          'prod-colgate',          'pnp', 'pnp:a6',       1),
  ('loc-pnp-dove',             'prod-dove-soap',        'pnp', 'pnp:a6',       1),
  ('loc-pnp-cola',             'prod-coca-cola',        'pnp', 'pnp:a7',       1),
  ('loc-pnp-rooibos',          'prod-rooibos-tea',      'pnp', 'pnp:a7',       1),
  ('loc-pnp-fiveroses',        'prod-five-roses',       'pnp', 'pnp:a7',       1),
  ('loc-pnp-purity',           'prod-purity',           'pnp', 'pnp:a8',       1),
  ('loc-pnp-pampers',          'prod-pampers',          'pnp', 'pnp:a8',       1),
  ('loc-pnp-chappies',         'prod-chappies',         'pnp', 'pnp:checkout', 1),
  ('loc-pnp-russians',         'prod-russians',         'pnp', 'pnp:deli',     1),
  ('loc-pnp-mince',            'prod-mince',            'pnp', 'pnp:butchery', 1),
  ('loc-pnp-chicken',          'prod-chicken',          'pnp', 'pnp:butchery', 1),
  ('loc-pnp-milk',             'prod-milk',             'pnp', 'pnp:dairy',    1),
  ('loc-pnp-yoghurt',          'prod-yoghurt',          'pnp', 'pnp:dairy',    1),
  ('loc-pnp-whipped',          'prod-whipped-cream',    'pnp', 'pnp:dairy',    1),
  ('loc-pnp-peas',             'prod-frozen-peas',      'pnp', 'pnp:frozen',   1);

-- ─────────────────────────────────────────────────────────────────────────
-- Product locations — Checkers (subset; demonstrates per-retailer aisle diffs)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO product_locations (id, product_id, retailer_id, aisle_id, is_primary) VALUES
  ('loc-chk-bananas',  'prod-bananas',         'checkers', 'chk:produce',  0),
  ('loc-chk-apples',   'prod-apples',          'checkers', 'chk:produce',  0),
  ('loc-chk-bread',    'prod-bread',           'checkers', 'chk:bakery',   0),
  ('loc-chk-eggs',     'prod-eggs',            'checkers', 'chk:dairy',    0),
  ('loc-chk-niknaks',  'prod-niknaks',         'checkers', 'chk:a1',       0),
  ('loc-chk-jungle',   'prod-jungle-oats',     'checkers', 'chk:a2',       0),
  ('loc-chk-koo',      'prod-koo-baked-beans', 'checkers', 'chk:a3',       0),
  ('loc-chk-tastic',   'prod-tastic-rice',     'checkers', 'chk:a3',       0),  -- different aisle vs. PnP!
  ('loc-chk-colgate',  'prod-colgate',         'checkers', 'chk:a6',       0),
  ('loc-chk-cola',     'prod-coca-cola',       'checkers', 'chk:a7',       0),
  ('loc-chk-mince',    'prod-mince',           'checkers', 'chk:butchery', 0),
  ('loc-chk-chicken',  'prod-chicken',         'checkers', 'chk:butchery', 0),
  ('loc-chk-milk',     'prod-milk',            'checkers', 'chk:dairy',    0),
  ('loc-chk-yoghurt',  'prod-yoghurt',         'checkers', 'chk:dairy',    0),
  ('loc-chk-peas',     'prod-frozen-peas',     'checkers', 'chk:frozen',   0);

-- ─────────────────────────────────────────────────────────────────────────
-- Product locations — Woolworths (subset; boutique layout)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO product_locations (id, product_id, retailer_id, aisle_id, is_primary) VALUES
  ('loc-wool-bananas', 'prod-bananas',      'woolworths', 'wool:fresh',    0),
  ('loc-wool-apples',  'prod-apples',       'woolworths', 'wool:fresh',    0),
  ('loc-wool-bread',   'prod-bread',        'woolworths', 'wool:bakery',   0),
  ('loc-wool-eggs',    'prod-eggs',         'woolworths', 'wool:dairy',    0),
  ('loc-wool-jungle',  'prod-jungle-oats',  'woolworths', 'wool:pantry',   0),
  ('loc-wool-tastic',  'prod-tastic-rice',  'woolworths', 'wool:pantry',   0),
  ('loc-wool-fattis',  'prod-fattis-pasta', 'woolworths', 'wool:pantry',   0),
  ('loc-wool-mince',   'prod-mince',        'woolworths', 'wool:butchery', 0),
  ('loc-wool-chicken', 'prod-chicken',      'woolworths', 'wool:butchery', 0),
  ('loc-wool-milk',    'prod-milk',         'woolworths', 'wool:dairy',    0),
  ('loc-wool-yoghurt', 'prod-yoghurt',      'woolworths', 'wool:dairy',    0),
  ('loc-wool-cola',    'prod-coca-cola',    'woolworths', 'wool:beverages',0),
  ('loc-wool-rooibos', 'prod-rooibos-tea',  'woolworths', 'wool:beverages',0);

-- ─────────────────────────────────────────────────────────────────────────
-- Product locations — Takealot (online, non-perishables only)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO product_locations (id, product_id, retailer_id, aisle_id, is_primary) VALUES
  ('loc-tak-jungle',   'prod-jungle-oats',     'takealot', NULL, 0),
  ('loc-tak-tastic',   'prod-tastic-rice',     'takealot', NULL, 0),
  ('loc-tak-koo',      'prod-koo-baked-beans', 'takealot', NULL, 0),
  ('loc-tak-handy',    'prod-handy-andy',      'takealot', NULL, 0),
  ('loc-tak-pampers',  'prod-pampers',         'takealot', NULL, 0),
  ('loc-tak-colgate',  'prod-colgate',         'takealot', NULL, 0);

-- ─────────────────────────────────────────────────────────────────────────
-- Product locations — Amazon.co.za (online, small subset)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO product_locations (id, product_id, retailer_id, aisle_id, is_primary) VALUES
  ('loc-amz-pampers',  'prod-pampers',     'amazon-coza', NULL, 0),
  ('loc-amz-colgate',  'prod-colgate',     'amazon-coza', NULL, 0),
  ('loc-amz-dove',     'prod-dove-soap',   'amazon-coza', NULL, 0);
