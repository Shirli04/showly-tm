const assert = require('assert');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'memory';
process.env.JWT_SECRET = 'test-secret';
process.env.PORT = '3100';
process.env.UPLOAD_DIR = path.resolve(__dirname, '..', '..', 'uploads-test');
process.env.PUBLIC_UPLOAD_BASE = '/uploads';

const { query } = require('../src/config/db');
const app = require('../src/app');

async function request(baseUrl, pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    json = text;
  }
  return { response, body: json };
}

async function main() {
  fs.mkdirSync(process.env.UPLOAD_DIR, { recursive: true });

  const passwordHash = await bcrypt.hash('secret', 10);
  await query(
    'INSERT INTO users (username, password_hash, role, permissions) VALUES ($1, $2, $3, $4::jsonb)',
    ['admin', passwordHash, 'superadmin', JSON.stringify(['dashboard', 'stores', 'products', 'orders', 'settings', 'users', 'categories', 'reservations'])]
  );

  const server = app.listen(3100);
  const baseUrl = 'http://127.0.0.1:3100';

  try {
    const health = await request(baseUrl, '/api/health');
    assert.equal(health.response.status, 200);

    const login = await request(baseUrl, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'secret' })
    });
    assert.equal(login.response.status, 200, `login failed: ${JSON.stringify(login.body)}`);
    assert.ok(login.body.token);
    const authHeaders = {
      Authorization: `Bearer ${login.body.token}`,
      'Content-Type': 'application/json'
    };

    const me = await request(baseUrl, '/api/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${login.body.token}` }
    });
    assert.equal(me.response.status, 200);
    assert.equal(me.body.user.username, 'admin');

    const parentCategory = await request(baseUrl, '/api/categories/parents', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ id: 'food', name: 'Food', icon: 'fa-utensils', order: 1 })
    });
    assert.equal(parentCategory.response.status, 201);

    const store = await request(baseUrl, '/api/stores', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Test Store',
        category: 'parent:food',
        phone: '+99361234567',
        orderPhone: '+99361234567',
        hasReservation: true
      })
    });
    assert.equal(store.response.status, 201, `store create failed: ${JSON.stringify(store.body)}`);

    const storeUpdate = await request(baseUrl, `/api/stores/${store.body.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ description: 'Updated store description', hasBron: true })
    });
    assert.equal(storeUpdate.response.status, 200);
    assert.equal(storeUpdate.body.hasBron, true);

    const productCreate = await request(baseUrl, '/api/products', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        storeId: store.body.id,
        title: 'Test Product',
        price: '25 TMT',
        category: 'Meals'
      })
    });
    assert.equal(productCreate.response.status, 201, `product create failed: ${JSON.stringify(productCreate.body)}`);

    const productUpdate = await request(baseUrl, `/api/products/${productCreate.body.id}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ title: 'Updated Product', price: '30 TMT' })
    });
    assert.equal(productUpdate.response.status, 200);
    assert.equal(productUpdate.body.title, 'Updated Product');

    const uploadForm = new FormData();
    uploadForm.append('folder', 'tests');
    uploadForm.append('file', new Blob(['hello'], { type: 'text/plain' }), 'hello.txt');
    const upload = await request(baseUrl, '/api/uploads', {
      method: 'POST',
      headers: { Authorization: `Bearer ${login.body.token}` },
      body: uploadForm
    });
    assert.equal(upload.response.status, 201, `upload failed: ${JSON.stringify(upload.body)}`);
    assert.ok(String(upload.body.url || '').startsWith('/uploads/'));

    const order = await request(baseUrl, '/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: store.body.id,
        storeName: store.body.name,
        customer: { name: 'Ali', phone: '+99360000000', address: 'Ashgabat' },
        items: [{ id: productCreate.body.id, title: 'Updated Product', price: '30 TMT', quantity: 2 }],
        total: '60 TMT',
        status: 'pending'
      })
    });
    assert.equal(order.response.status, 201, `order create failed: ${JSON.stringify(order.body)}`);

    const ordersList = await request(baseUrl, '/api/orders');
    assert.equal(ordersList.response.status, 200);
    assert.equal(ordersList.body.length, 1);

    const productsList = await request(baseUrl, `/api/products?filters=${encodeURIComponent(JSON.stringify([{ field: 'storeId', value: store.body.id }]))}`);
    assert.equal(productsList.response.status, 200);
    assert.equal(productsList.body.length, 1);

    const deleteProduct = await request(baseUrl, `/api/products/${productCreate.body.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${login.body.token}` }
    });
    assert.equal(deleteProduct.response.status, 204);

    const deleteUpload = await request(baseUrl, '/api/uploads', {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ filePath: upload.body.url })
    });
    assert.equal(deleteUpload.response.status, 200);

    const deleteStore = await request(baseUrl, `/api/stores/${store.body.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${login.body.token}` }
    });
    assert.equal(deleteStore.response.status, 204);

    console.log('Smoke tests passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
