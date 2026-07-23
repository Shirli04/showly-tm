const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { Pool } = require('pg');
const { newDb, DataType } = require('pg-mem');
const env = require('./env');

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

function createMemoryPool() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    implementation: () => randomUUID()
  });

  const schemaPath = path.resolve(env.rootDir, 'sql', 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8').replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;?/gi, '');
  db.public.none(schemaSql);

  const adapter = db.adapters.createPg();
  return new adapter.Pool();
}

const pool = env.databaseUrl === 'memory'
  ? createMemoryPool()
  : new Pool({
    connectionString: env.databaseUrl,
    ssl: env.nodeEnv === 'production' && !String(env.databaseUrl).includes('localhost')
      ? { rejectUnauthorized: false }
      : false
  });

async function runMigrations() {
  if (env.databaseUrl === 'memory') return;
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;
  `);
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS fcm_token TEXT;
  `);
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS fcm_tokens TEXT[] DEFAULT ARRAY[]::TEXT[];
  `);
  await pool.query(`
    ALTER TABLE stores
      ADD COLUMN IF NOT EXISTS stoplist_products_enabled BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  await pool.query(`
    ALTER TABLE stores
      ADD COLUMN IF NOT EXISTS stoplist_product_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_store_id ON users(store_id);
  `);
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS plain_password TEXT;
  `);
  await pool.query(`
    ALTER TABLE stores
      ADD COLUMN IF NOT EXISTS category_order JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);
  // ✅ Türkçe (TR) dil desteği için yeni sütunlar
  await pool.query(`
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS name_tr VARCHAR(255) DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS desc_tr TEXT DEFAULT '';
  `);
  await pool.query(`
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS category_tr VARCHAR(255) DEFAULT '';
  `);
  // ✅ Upsell — bu ürün hangi kategorilerde yan olarak önerilsin?
  await pool.query(`
    ALTER TABLE products
      ADD COLUMN IF NOT EXISTS pairing_for JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);

  // ✅ Kafe LAN sistemi tabloları (idempotent — mevcut deployment'a ekleme).
  // Sadece schema.sql güncellemek yetmez, çünkü prodüksiyon veritabanı zaten kurulu.
  await pool.query(`
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
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cafe_installs_store_id ON cafe_installs(store_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cafe_installs_last_heartbeat ON cafe_installs(last_heartbeat_at DESC);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cafe_heartbeats (
      id BIGSERIAL PRIMARY KEY,
      cafe_install_id UUID NOT NULL REFERENCES cafe_installs(id) ON DELETE CASCADE,
      snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cafe_heartbeats_install_at ON cafe_heartbeats(cafe_install_id, at DESC);`);

  await pool.query(`
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
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cafe_commands_install_status ON cafe_commands(cafe_install_id, status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cafe_commands_created_at ON cafe_commands(created_at DESC);`);

  await pool.query(`
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
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_cafe_releases_released_at ON cafe_releases(released_at DESC);`);
}

async function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query,
  withTransaction,
  runMigrations
};
