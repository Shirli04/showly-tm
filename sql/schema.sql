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
    stoplist_products_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    stoplist_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
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
    name_tr VARCHAR(255) DEFAULT '',
    description TEXT DEFAULT '',
    desc_ru TEXT DEFAULT '',
    desc_en TEXT DEFAULT '',
    desc_tr TEXT DEFAULT '',
    material TEXT DEFAULT '',
    category VARCHAR(255) DEFAULT '',
    category_ru VARCHAR(255) DEFAULT '',
    category_en VARCHAR(255) DEFAULT '',
    category_tr VARCHAR(255) DEFAULT '',
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

-- ✅ Performans #7: Yeni indexler (kategori filtresi + sipariş status + bileşik)
-- Kategori filtreleme: müşteri "Çorbalar" tıkladığında hızlı
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_store_category ON products(store_id, category);
-- Admin paneli sipariş listesi (status'a göre filtreleme)
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
-- Mağaza sipariş geçmişi (ortak kullanılan filtre: store + tarih)
CREATE INDEX IF NOT EXISTS idx_orders_store_created ON orders(store_id, created_at DESC);

-- =============================================================================
-- Kafe LAN sistemi (cafe-server) için tablolar
-- Her kafedeki laptop kurulumu buradan yönetilir ve bu tablolar üzerinden
-- senkron/komut/durum akışı yürür. Kafe internete çıkabildiği anda çalışır.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cafe_installs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    label VARCHAR(255) NOT NULL,
    api_token_hash TEXT NOT NULL,
    api_token_prefix VARCHAR(16) NOT NULL,
    version VARCHAR(50) DEFAULT '',
    last_heartbeat_at TIMESTAMPTZ,
    last_sync_at TIMESTAMPTZ,
    last_seen_ip VARCHAR(64) DEFAULT '',
    tablets_count INTEGER NOT NULL DEFAULT 0,
    waiters_count INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cafe_installs_store_id ON cafe_installs(store_id);
CREATE INDEX IF NOT EXISTS idx_cafe_installs_last_heartbeat ON cafe_installs(last_heartbeat_at DESC);

CREATE TABLE IF NOT EXISTS cafe_heartbeats (
    id BIGSERIAL PRIMARY KEY,
    cafe_install_id UUID NOT NULL REFERENCES cafe_installs(id) ON DELETE CASCADE,
    snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cafe_heartbeats_install_at ON cafe_heartbeats(cafe_install_id, at DESC);

CREATE TABLE IF NOT EXISTS cafe_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_install_id UUID NOT NULL REFERENCES cafe_installs(id) ON DELETE CASCADE,
    kind VARCHAR(80) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    result JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dispatched_at TIMESTAMPTZ,
    acked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cafe_commands_install_status ON cafe_commands(cafe_install_id, status);
CREATE INDEX IF NOT EXISTS idx_cafe_commands_created_at ON cafe_commands(created_at DESC);

CREATE TABLE IF NOT EXISTS cafe_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(50) NOT NULL UNIQUE,
    changelog TEXT DEFAULT '',
    artifact_url TEXT NOT NULL,
    sha256 VARCHAR(128) NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    is_stable BOOLEAN NOT NULL DEFAULT FALSE,
    released_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cafe_releases_released_at ON cafe_releases(released_at DESC);
