const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
const { query } = require('../src/config/db');

function getArg(name) {
  const direct = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (direct) return direct.split('=').slice(1).join('=');
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1];
  return '';
}

async function main() {
  const username = getArg('username');
  const password = getArg('password');
  const role = getArg('role') || 'superadmin';

  if (!username || !password) {
    throw new Error('Usage: npm run create-admin -- --username admin --password secret123');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const permissions = ['dashboard', 'stores', 'products', 'orders', 'settings', 'users', 'categories', 'reservations'];

  await query(`
    INSERT INTO users (username, password_hash, role, permissions)
    VALUES ($1, $2, $3, $4::jsonb)
    ON CONFLICT (username) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      role = EXCLUDED.role,
      permissions = EXCLUDED.permissions,
      updated_at = NOW()
  `, [username, passwordHash, role, JSON.stringify(permissions)]);

  console.log(`Admin user ready: ${username}`);
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
