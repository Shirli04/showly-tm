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
    CREATE INDEX IF NOT EXISTS idx_users_store_id ON users(store_id);
  `);
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
