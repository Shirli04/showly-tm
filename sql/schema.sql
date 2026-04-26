CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'admin',
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS parent_categories (
    id VARCHAR(120) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    name_ru VARCHAR(255) DEFAULT '',
    name_en VARCHAR(255) DEFAULT '',
    icon VARCHAR(100) DEFAULT 'fa-tag',
    sort_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subcategories (
    id VARCHAR(120) PRIMARY KEY,
    parent_category_id VARCHAR(120) NOT NULL REFERENCES parent_categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    name_ru VARCHAR(255) DEFAULT '',
    name_en VARCHAR(255) DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    parent_category_id VARCHAR(120) REFERENCES parent_categories(id) ON DELETE SET NULL,
    subcategory_id VARCHAR(120) REFERENCES subcategories(id) ON DELETE SET NULL,
    custom_banner_text TEXT DEFAULT '',
    tiktok_url TEXT DEFAULT '',
    instagram_url TEXT DEFAULT '',
    phone VARCHAR(50) DEFAULT '',
    location TEXT DEFAULT '',
    order_phone VARCHAR(50) DEFAULT '',
    has_reservation BOOLEAN NOT NULL DEFAULT FALSE,
    has_bron BOOLEAN NOT NULL DEFAULT FALSE,
    restaurant_schema_url TEXT DEFAULT '',
    featured_products_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    featured_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    ready_meal_products_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ready_meal_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    tables JSONB NOT NULL DEFAULT '[]'::jsonb,
    views INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    name_ru VARCHAR(255) DEFAULT '',
    name_en VARCHAR(255) DEFAULT '',
    description TEXT DEFAULT '',
    desc_ru TEXT DEFAULT '',
    desc_en TEXT DEFAULT '',
    material TEXT DEFAULT '',
    category VARCHAR(255) DEFAULT '',
    category_ru VARCHAR(255) DEFAULT '',
    category_en VARCHAR(255) DEFAULT '',
    price NUMERIC(12,2) NOT NULL DEFAULT 0,
    discounted_price NUMERIC(12,2),
    is_on_sale BOOLEAN NOT NULL DEFAULT FALSE,
    image_url TEXT DEFAULT '',
    image_public_id TEXT DEFAULT '',
    variants JSONB NOT NULL DEFAULT '[]'::jsonb,
    views INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_type VARCHAR(50) NOT NULL DEFAULT 'order',
    store_id UUID REFERENCES stores(id) ON DELETE SET NULL,
    store_name VARCHAR(255) DEFAULT '',
    customer_name VARCHAR(255) DEFAULT '',
    customer_phone VARCHAR(100) DEFAULT '',
    customer_address TEXT DEFAULT '',
    customer_note TEXT DEFAULT '',
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_label VARCHAR(100) DEFAULT '0 TMT',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    order_number VARCHAR(100),
    event_type VARCHAR(255),
    guest_count INTEGER,
    table_number VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservation_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    total_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    service_types JSONB NOT NULL DEFAULT '[]'::jsonb,
    service_features JSONB NOT NULL DEFAULT '[]'::jsonb,
    menu_items JSONB NOT NULL DEFAULT '[]'::jsonb,
    capacities JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(120) PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO settings (key, value)
VALUES ('general', '{"hideCategories":false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_stores_slug ON stores(slug);
CREATE INDEX IF NOT EXISTS idx_users_store_id ON users(store_id);
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservation_packages_store_id ON reservation_packages(store_id);
