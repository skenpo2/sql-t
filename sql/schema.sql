-- ===========================================================================
-- MODULE 2 (F2) — Relational modeling, JOINs, transactions & performance
-- ===========================================================================
-- Run with:  npm run db:setup     (which runs: psql "$DATABASE_URL" -f sql/schema.sql)
--
-- This one file demonstrates every F2 learning objective:
--   • Primary keys / foreign keys / referential integrity
--   • Relationships: 1:1, 1:N, M:N (+ junction table)
--   • JSONB for flexible data
--   • Indexes (incl. a GIN index for JSONB)
-- ===========================================================================

-- Drop in reverse dependency order so foreign keys don't block us.
-- CASCADE also drops anything that depends on the table.
DROP TABLE IF EXISTS line_items    CASCADE;
DROP TABLE IF EXISTS orders        CASCADE;
DROP TABLE IF EXISTS products      CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS users         CASCADE;


-- ---------------------------------------------------------------------------
-- users  — the "parent" table. Everything hangs off a user.
-- ---------------------------------------------------------------------------
-- PRIMARY KEY: uniquely identifies each row, never null. SERIAL auto-numbers it.
CREATE TABLE users (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    email       VARCHAR(255) NOT NULL UNIQUE,   -- UNIQUE = no two users share an email
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- user_profiles  — 1:1 relationship with users
-- ---------------------------------------------------------------------------
-- Each user has AT MOST ONE profile. What makes it 1:1 (not 1:N)?
--   • user_id is a FOREIGN KEY  -> it must point at a real users.id
--   • user_id is also UNIQUE    -> a given user can appear here only once
-- Drop the UNIQUE and this would silently become 1:N. The constraint IS the rule.
--
-- ON DELETE CASCADE: if the user is deleted, their profile is auto-deleted too.
CREATE TABLE user_profiles (
    id           SERIAL PRIMARY KEY,
    user_id      INT  NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    bio          TEXT,
    avatar_url   TEXT,
    preferences  JSONB NOT NULL DEFAULT '{}'    -- flexible per-user settings blob
);




-- ---------------------------------------------------------------------------
-- products  — standalone catalog. Shows off JSONB for flexible data.
-- ---------------------------------------------------------------------------
-- Different products have different specs (a shirt has size/color, a cable has
-- length). Rather than 30 mostly-empty columns, put the variable specs in JSONB.
-- CHECK constraints enforce data sanity at the DB level (not just in app code).
CREATE TABLE products (
    id           SERIAL PRIMARY KEY,
    name         VARCHAR(200) NOT NULL,
    price_cents  INT NOT NULL CHECK (price_cents >= 0),   -- store money as integer cents
    stock        INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
    attributes   JSONB NOT NULL DEFAULT '{}',             -- e.g. {"color":"red","size":"M"}
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- orders  — 1:N relationship (one user -> many orders)
-- ---------------------------------------------------------------------------
-- The FK lives on the "many" side. Every order carries the user_id it belongs to.
-- ON DELETE RESTRICT: refuse to delete a user who still has orders. This is
-- referential integrity protecting you from orphaned orders.
CREATE TABLE orders (
    id          SERIAL PRIMARY KEY,
    user_id     INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status      VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ---------------------------------------------------------------------------
-- line_items  — M:N junction between orders and products
-- ---------------------------------------------------------------------------
-- An order contains many products; a product appears in many orders. SQL can't
-- store "many on both sides" directly, so we use a JUNCTION TABLE in the middle.
-- Each row = "this order contains this product, N times, at this price".
--
--   orders  1───∞  line_items  ∞───1  products
--
-- UNIQUE(order_id, product_id): the same product can't be listed twice on one
-- order (bump quantity instead). unit_price_cents is a SNAPSHOT of the price at
-- purchase time — if the product's price changes later, past orders don't.
CREATE TABLE line_items (
    id                SERIAL PRIMARY KEY,
    order_id          INT NOT NULL REFERENCES orders(id)   ON DELETE CASCADE,
    product_id        INT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity          INT NOT NULL CHECK (quantity > 0),
    unit_price_cents  INT NOT NULL,
    UNIQUE (order_id, product_id)
);


-- ---------------------------------------------------------------------------
-- INDEXES
-- ---------------------------------------------------------------------------
-- Surprise: Postgres auto-indexes PRIMARY KEYs and UNIQUE columns, but NOT the
-- foreign-key columns. Every "find the orders for this user" or "find the line
-- items for this order" does a full table scan until you add these.
CREATE INDEX idx_orders_user_id        ON orders(user_id);
CREATE INDEX idx_line_items_order_id   ON line_items(order_id);
CREATE INDEX idx_line_items_product_id ON line_items(product_id);

-- GIN index: the right index type for JSONB containment queries like
-- attributes @> '{"color":"red"}'. A normal B-tree index can't do that.
CREATE INDEX idx_products_attributes   ON products USING GIN (attributes);


-- ===========================================================================
-- SEED DATA
-- ===========================================================================

-- A handful of real users. NOTE: 'Grace Hopper' will deliberately have NO
-- orders, so the LEFT JOIN demo has something interesting to show.
INSERT INTO users (name, email) VALUES
    ('Ada Lovelace',  'ada@example.com'),
    ('Alan Turing',   'alan@example.com'),
    ('Grace Hopper',  'grace@example.com');

-- 1:1 profiles for two of the three users (Grace has none -> another LEFT JOIN case).
INSERT INTO user_profiles (user_id, bio, preferences) VALUES
    (1, 'Mathematician; first programmer.', '{"theme":"dark","newsletter":true}'),
    (2, 'Broke Enigma; foundational CS.',   '{"theme":"light","newsletter":false}');

-- A few hand-written products with varied JSONB attributes.
INSERT INTO products (name, price_cents, stock, attributes) VALUES
    ('Red T-Shirt',      1999,  50, '{"color":"red","size":"M","material":"cotton"}'),
    ('Blue Hoodie',      4999,  30, '{"color":"blue","size":"L","material":"fleece"}'),
    ('USB-C Cable 2m',    999, 200, '{"color":"black","length_m":2}'),
    ('Mechanical Keyboard', 8999, 15, '{"color":"black","switches":"brown","layout":"US"}');

-- Real orders + line items so JOINs return meaningful rows.
-- Ada (user 1) places two orders; Alan (user 2) places one; Grace places none.
INSERT INTO orders (user_id, status) VALUES
    (1, 'paid'),        -- order 1
    (1, 'pending'),     -- order 2
    (2, 'paid');        -- order 3

INSERT INTO line_items (order_id, product_id, quantity, unit_price_cents) VALUES
    (1, 1, 2, 1999),    -- order 1: 2x Red T-Shirt
    (1, 3, 1,  999),    -- order 1: 1x USB-C Cable
    (2, 4, 1, 8999),    -- order 2: 1x Keyboard
    (3, 2, 3, 4999);    -- order 3: 3x Blue Hoodie

-- A few more products so listing endpoints have multiple pages to page through.
INSERT INTO products (name, price_cents, stock, attributes)
SELECT
    'Sample Product ' || g,
    (g * 137) % 20000 + 100,
    100,
    jsonb_build_object(
        'color', (ARRAY['red','green','blue'])[1 + g % 3],
        'size',  (ARRAY['S','M','L'])[1 + g % 3]
    )
FROM generate_series(1, 30) AS g;
