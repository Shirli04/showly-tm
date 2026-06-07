const fs = require('fs');
const path = require('path');
const cors = require('cors');
const express = require('express');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const multer = require('multer');
const env = require('./config/env');
const HttpError = require('./utils/http-error');
const asyncHandler = require('./utils/async-handler');
const { requireAuth, requireRoleOrPermission, requireSuperAdmin } = require('./middleware/auth');
const errorHandler = require('./middleware/error-handler');
const notFound = require('./middleware/not-found');
const { upload, getPublicUploadPath, resolveUploadFile, sanitizeSegment } = require('./services/uploads');
const {
  collectionToResource,
  listResource,
  getResource,
  upsertResource,
  deleteByResource,
  getUserWithPasswordByUsername,
  saveUserFcmToken,
  getCatalogBootstrap,
  commitBatch
} = require('./services/repository');
const { sendNewOrderNotification } = require('./services/fcm');

const app = express();

const corsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (env.corsOrigin === '*') {
      return callback(null, true);
    }

    const allowList = Array.isArray(env.corsOrigin) ? env.corsOrigin : [env.corsOrigin];
    if (allowList.includes(origin)) {
      return callback(null, true);
    }

    return callback(new HttpError(403, `CORS blocked for origin: ${origin}`));
  }
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

fs.mkdirSync(env.uploadDir, { recursive: true });

app.use(env.publicUploadBase, express.static(env.uploadDir));
app.use('/vendor/fontawesome', express.static(path.join(env.rootDir, 'node_modules', '@fortawesome', 'fontawesome-free')));
app.use('/vendor/chart.js', express.static(path.join(env.rootDir, 'node_modules', 'chart.js')));
app.use('/vendor/bcryptjs', express.static(path.join(env.rootDir, 'node_modules', 'bcryptjs')));

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// ✅ Login brute-force koruması (in-memory rate limiter)
// IP başına 5 dakika içinde 5 yanlış deneme → 15 dakika engel
const LOGIN_WINDOW_MS = 5 * 60 * 1000;    // 5 dk pencere
const LOGIN_MAX_ATTEMPTS = 5;             // 5 yanlış deneme
const LOGIN_BLOCK_MS = 15 * 60 * 1000;    // 15 dk engel
const loginAttempts = new Map();          // ip → { count, firstAt, blockedUntil }

function getClientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.ip || req.connection?.remoteAddress || 'unknown';
}

function checkLoginRateLimit(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const rec = loginAttempts.get(ip);
  if (rec && rec.blockedUntil && rec.blockedUntil > now) {
    const remain = Math.ceil((rec.blockedUntil - now) / 1000);
    throw new HttpError(429, `Too many failed attempts. Try again in ${remain}s`);
  }
}

function recordLoginFailure(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  let rec = loginAttempts.get(ip);
  if (!rec || (now - rec.firstAt) > LOGIN_WINDOW_MS) {
    rec = { count: 0, firstAt: now, blockedUntil: 0 };
  }
  rec.count += 1;
  if (rec.count >= LOGIN_MAX_ATTEMPTS) {
    rec.blockedUntil = now + LOGIN_BLOCK_MS;
  }
  loginAttempts.set(ip, rec);
}

function recordLoginSuccess(req) {
  loginAttempts.delete(getClientIp(req));
}

// Bellek temizliği (sızıntı önleme): 30 dakikada bir eski kayıtları sil
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of loginAttempts.entries()) {
    const expired = (now - rec.firstAt) > LOGIN_WINDOW_MS && (!rec.blockedUntil || rec.blockedUntil < now);
    if (expired) loginAttempts.delete(ip);
  }
}, 30 * 60 * 1000).unref?.();

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  checkLoginRateLimit(req);

  const { username, password } = req.body || {};
  if (!username || !password) {
    throw new HttpError(400, 'Username and password are required');
  }

  const user = await getUserWithPasswordByUsername(username.trim());
  if (!user) {
    recordLoginFailure(req);
    throw new HttpError(401, 'Invalid username or password');
  }

  const hash = user.password_hash || '';
  const isHash = hash.startsWith('$2');
  const isValid = isHash ? await bcrypt.compare(password, hash) : password === hash;

  if (!isValid) {
    recordLoginFailure(req);
    throw new HttpError(401, 'Invalid username or password');
  }

  recordLoginSuccess(req);

  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
    storeId: user.storeId || user.store_id || null
  };

  const requiresStore = payload.role !== 'admin' && payload.role !== 'superadmin';
  if (requiresStore && !payload.storeId) {
    throw new HttpError(403, 'Bu kullaniciya magaza atanmamis. Lutfan admin panelinden magaza baglayin.');
  }

  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: '7d' });
  res.json({ token, user: payload });
}));

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/fcm-token', requireAuth, asyncHandler(async (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!token) {
    throw new HttpError(400, 'token is required');
  }

  await saveUserFcmToken(req.user.id, token);
  res.json({ success: true });
}));

app.get('/api/catalog/bootstrap', asyncHandler(async (req, res) => {
  res.json(await getCatalogBootstrap());
}));

function handleUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE'
        ? 'File too large (max 10 MB)'
        : (err.message || 'Upload error');
      return next(new HttpError(400, msg));
    }
    next();
  });
}

app.post('/api/uploads', requireAuth, handleUpload, asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, 'File is required');
  }

  res.status(201).json({
    url: getPublicUploadPath(req.file.path),
    fileName: req.file.filename,
    originalName: req.file.originalname
  });
}));

app.delete('/api/uploads', requireAuth, asyncHandler(async (req, res) => {
  const filePath = req.body?.filePath || req.query.filePath || req.body?.url || req.query.url;
  if (!filePath) {
    throw new HttpError(400, 'filePath is required');
  }

  let absolutePath;
  try {
    absolutePath = resolveUploadFile(filePath);
  } catch (err) {
    throw new HttpError(400, 'Invalid file path');
  }

  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }

  res.json({ success: true });
}));

const excelUpload = multer({ storage: multer.diskStorage({
  destination(req, file, cb) { cb(null, require('os').tmpdir()); },
  filename(req, file, cb) { cb(null, `excel-${Date.now()}.xlsx`); }
}) });

app.post('/api/products/import-excel', requireAuth, excelUpload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Excel dosyası gerekli');

  try {
    const workbook = XLSX.readFile(req.file.path);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    // Büyük/küçük harf duyarsız field okuma (ý/y varyantları dahil)
    function getField(row, ...keys) {
      const rowLower = {};
      Object.keys(row).forEach(k => {
        const normalized = k.toLowerCase().replace(/ý/g, 'y').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ň/g, 'n').replace(/ž/g, 'z');
        rowLower[normalized] = row[k];
        rowLower[k.toLowerCase()] = row[k];
      });
      for (const key of keys) {
        const keyNorm = key.toLowerCase().replace(/ý/g, 'y').replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ň/g, 'n').replace(/ž/g, 'z');
        const val = rowLower[keyNorm] ?? rowLower[key.toLowerCase()];
        if (val !== undefined && val !== null && String(val).trim() !== '') return String(val).trim();
      }
      return '';
    }

    const stores = await listResource('stores', {});
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      try {
        const storeName = getField(row, 'Magazyn Ady', 'Mağaza Adı', 'Magaza Adi');
        if (!storeName) { errorCount++; errors.push(`Satır ${i + 2}: Mağaza adı boş`); continue; }

        const store = stores.find(s => {
          const sName = String(s.name || '').toLowerCase();
          const sSlug = String(s.slug || '').toLowerCase();
          return sName === storeName.toLowerCase() || sSlug === storeName.toLowerCase();
        });
        if (!store) { errorCount++; errors.push(`Satır ${i + 2}: "${storeName}" mağazası bulunamadı`); continue; }

        const title = getField(row, 'Haryt Ady (TM)', 'Haryt Ady', 'Ürün Adı');
        if (!title) { errorCount++; errors.push(`Satır ${i + 2}: Ürün adı boş`); continue; }

        const normalPrice = getField(row, 'Baha', 'Normal Fiyat') || '0';
        const normalPriceClean = normalPrice.replace('TMT', '').trim();
        const discountedPrice = getField(row, 'Arzanladyş Bahasy', 'İndirimli Fiyat').replace('TMT', '').trim();
        const isOnSale = discountedPrice && !isNaN(discountedPrice) && parseFloat(discountedPrice) > 0;

        const productData = {
          storeId: store.id,
          title,
          description: getField(row, 'Düşündiriş (TM)', 'Düşündiriş', 'Açıklama'),
          name_ru: getField(row, 'Haryt Ady (RU)', 'Haryt Ady (Ru)'),
          name_en: getField(row, 'Haryt Ady (EN)', 'Haryt Ady (En)'),
          desc_ru: getField(row, 'Düşündiriş (RU)', 'Düşündiriş (Ru)'),
          desc_en: getField(row, 'Düşündiriş (EN)', 'Düşündiriş (En)'),
          price: `${normalPriceClean} TMT`,
          originalPrice: isOnSale ? `${discountedPrice} TMT` : '',
          isOnSale,
          category: getField(row, 'Kategoriýa (TM)', 'Kategoriýa', 'Kategori'),
          category_ru: getField(row, 'Kategoriýa (RU)', 'Kategoriýa (Ru)'),
          category_en: getField(row, 'Kategoriýa (EN)', 'Kategoriýa (En)'),
          material: getField(row, 'Material', 'Malzeme'),
          imageUrl: getField(row, 'Surat URL', 'Resim URL'),
        };

        const existingId = getField(row, 'Haryt ID', 'Product ID');
        await upsertResource('products', productData, existingId || undefined);
        successCount++;
      } catch (err) {
        errorCount++;
        errors.push(`Satır ${i + 2}: ${err.message}`);
      }
    }

    fs.unlinkSync(req.file.path);
    res.json({ success: true, successCount, errorCount, errors: errors.slice(0, 10) });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    throw err;
  }
}));

app.post('/api/batch', requireAuth, asyncHandler(async (req, res) => {
  const operations = Array.isArray(req.body?.operations) ? req.body.operations : [];
  await commitBatch(operations);
  res.json({ success: true });
}));

function permissionForResource(resource) {
  const map = {
    stores: 'stores',
    products: 'products',
    orders: 'orders',
    users: 'users',
    parentCategories: 'categories',
    subcategories: 'categories',
    reservationPackages: 'reservations',
    settings: 'settings'
  };
  return map[resource] || 'dashboard';
}

const STORE_SPECIAL_UPDATE_FIELDS = [
  'featuredProductsEnabled',
  'featuredProductIds',
  'readyMealProductsEnabled',
  'readyMealProductIds',
  'stoplistProductsEnabled',
  'stoplistProductIds'
];

function normalizePermission(value) {
  return String(value || '').trim().toLowerCase();
}

function hasPermission(user, ...targets) {
  const wanted = new Set(targets.map(normalizePermission).filter(Boolean));
  if (wanted.size === 0) return false;
  const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
  return permissions.some((permission) => {
    const normalized = normalizePermission(permission);
    if (!normalized) return false;
    return wanted.has(normalized);
  });
}

function pickStoreSpecialUpdatePayload(body) {
  const source = body && typeof body === 'object' ? body : {};
  const picked = {};
  STORE_SPECIAL_UPDATE_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      picked[field] = source[field];
    }
  });
  return picked;
}

function requireStoreWriteAccess(req, res, next) {
  const user = req.user;
  if (!user) {
    return next(new HttpError(401, 'Authentication required'));
  }

  if (user.role === 'superadmin' || user.role === 'admin') {
    return next();
  }

  if (hasPermission(user, 'stores', 'store')) {
    return next();
  }

  const isStoreUser = user.role === 'store_user';
  const userStoreId = String(user.storeId || '').trim();
  const targetStoreId = String(req.params?.id || '').trim();

  if (!isStoreUser || !userStoreId || userStoreId !== targetStoreId) {
    return next(new HttpError(403, 'Insufficient permissions'));
  }

  if (req.method === 'POST') {
    return next(new HttpError(403, 'Insufficient permissions'));
  }

  req.body = pickStoreSpecialUpdatePayload(req.body);
  return next();
}

async function requireProductWriteAccess(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return next(new HttpError(401, 'Authentication required'));
    }

    if (user.role === 'superadmin' || user.role === 'admin') {
      return next();
    }

    if (hasPermission(user, 'products', 'product')) {
      return next();
    }

    if (user.role !== 'store_user') {
      return next(new HttpError(403, 'Insufficient permissions'));
    }

    const userStoreId = String(user.storeId || '').trim();
    if (!userStoreId) {
      return next(new HttpError(403, 'Insufficient permissions'));
    }

    if (req.method === 'POST') {
      const requestStoreId = String(req.body?.storeId || req.body?.store_id || '').trim();
      if (requestStoreId && requestStoreId !== userStoreId) {
        return next(new HttpError(403, 'Insufficient permissions'));
      }
      req.body = { ...(req.body || {}), storeId: userStoreId };
      return next();
    }

    const productId = String(req.params?.id || '').trim();
    if (!productId) {
      return next(new HttpError(400, 'Product id is required'));
    }

    const existing = await getResource('products', productId);
    if (!existing) {
      return next(new HttpError(404, 'Resource not found'));
    }

    if (String(existing.storeId || '').trim() !== userStoreId) {
      return next(new HttpError(403, 'Insufficient permissions'));
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      req.body = { ...(req.body || {}), storeId: userStoreId };
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

function createCrudRoutes(basePath, resource, options = {}) {
  app.get(basePath, asyncHandler(async (req, res) => {
    res.json(await listResource(resource, req.query));
  }));

  app.get(`${basePath}/:id`, asyncHandler(async (req, res) => {
    const document = await getResource(resource, req.params.id);
    if (!document) {
      throw new HttpError(404, 'Resource not found');
    }
    res.json(document);
  }));

  const writeGuards = options.writeGuards
    ? options.writeGuards
    : options.superAdminOnly
      ? [requireAuth, requireSuperAdmin]
      : [requireAuth, requireRoleOrPermission(permissionForResource(resource))];

  const createHandler = asyncHandler(async (req, res) => {
    const created = await upsertResource(resource, req.body);

    if (resource === 'orders' && created?.id) {
      sendNewOrderNotification(created).catch((error) => {
        console.error('[FCM] Failed to send order notification:', error.message);
      });
    }

    res.status(201).json(created);
  });

  if (options.publicCreate) {
    app.post(basePath, createHandler);
  } else {
    app.post(basePath, ...writeGuards, createHandler);
  }

  app.put(`${basePath}/:id`, ...writeGuards, asyncHandler(async (req, res) => {
    res.json(await upsertResource(resource, req.body, req.params.id));
  }));

  app.patch(`${basePath}/:id`, ...writeGuards, asyncHandler(async (req, res) => {
    res.json(await upsertResource(resource, req.body, req.params.id));
  }));

  app.delete(`${basePath}/:id`, ...writeGuards, asyncHandler(async (req, res) => {
    await deleteByResource(resource, req.params.id);
    res.status(204).send();
  }));
}

createCrudRoutes('/api/stores', 'stores', { writeGuards: [requireAuth, requireStoreWriteAccess] });
createCrudRoutes('/api/products', 'products', { writeGuards: [requireAuth, requireProductWriteAccess] });
createCrudRoutes('/api/orders', 'orders', { publicCreate: true });

app.post('/api/stores/:id/view', asyncHandler(async (req, res) => {
  await upsertResource('stores', { views: { __increment: 1 } }, req.params.id);
  res.json({ success: true });
}));
createCrudRoutes('/api/users', 'users');
createCrudRoutes('/api/categories/parents', 'parentCategories');
createCrudRoutes('/api/categories/subcategories', 'subcategories');
createCrudRoutes('/api/reservation-packages', 'reservationPackages');

app.get('/api/settings', asyncHandler(async (req, res) => {
  res.json(await listResource('settings', req.query));
}));
app.get('/api/settings/:id', asyncHandler(async (req, res) => {
  const document = await getResource('settings', req.params.id);
  if (!document) throw new HttpError(404, 'Setting not found');
  res.json(document);
}));
app.put('/api/settings/:id', requireAuth, requireRoleOrPermission('settings'), asyncHandler(async (req, res) => {
  res.json(await upsertResource('settings', req.body, req.params.id));
}));
app.patch('/api/settings/:id', requireAuth, requireRoleOrPermission('settings'), asyncHandler(async (req, res) => {
  res.json(await upsertResource('settings', req.body, req.params.id));
}));

app.get('/api/categories/legacy', asyncHandler(async (req, res) => {
  res.json([]);
}));

app.get('/api/collections/:name', asyncHandler(async (req, res) => {
  const resource = collectionToResource[req.params.name];
  if (!resource) throw new HttpError(404, 'Unknown collection');
  res.json(await listResource(resource, req.query));
}));

app.get('/api/collections/:name/:id', asyncHandler(async (req, res) => {
  const resource = collectionToResource[req.params.name];
  if (!resource) throw new HttpError(404, 'Unknown collection');
  const document = await getResource(resource, req.params.id);
  if (!document) throw new HttpError(404, 'Document not found');
  res.json(document);
}));

app.post('/api/collections/:name', asyncHandler(async (req, res, next) => {
  const resource = collectionToResource[req.params.name];
  if (!resource) throw new HttpError(404, 'Unknown collection');

  if (resource !== 'orders') {
    return requireAuth(req, res, async (authError) => {
      if (authError) return next(authError);
      return res.status(201).json(await upsertResource(resource, req.body));
    });
  }

  res.status(201).json(await upsertResource(resource, req.body));
}));

app.put('/api/collections/:name/:id', requireAuth, asyncHandler(async (req, res) => {
  const resource = collectionToResource[req.params.name];
  if (!resource) throw new HttpError(404, 'Unknown collection');
  res.json(await upsertResource(resource, req.body, req.params.id));
}));

app.patch('/api/collections/:name/:id', requireAuth, asyncHandler(async (req, res) => {
  const resource = collectionToResource[req.params.name];
  if (!resource) throw new HttpError(404, 'Unknown collection');
  res.json(await upsertResource(resource, req.body, req.params.id));
}));

app.delete('/api/collections/:name/:id', requireAuth, asyncHandler(async (req, res) => {
  const resource = collectionToResource[req.params.name];
  if (!resource) throw new HttpError(404, 'Unknown collection');
  await deleteByResource(resource, req.params.id);
  res.status(204).send();
}));

app.use((req, res, next) => {
  const blockedPrefixes = ['/server/', '/sql/', '/deploy/', '/node_modules/'];
  if (blockedPrefixes.some((prefix) => req.path.startsWith(prefix)) || req.path === '/package.json' || req.path.startsWith('/.env')) {
    return res.status(404).end();
  }
  return next();
});

app.use(express.static(env.rootDir, {
  index: false,
  dotfiles: 'ignore'
}));

app.get(['/login', '/login.html'], (req, res) => {
  res.sendFile(path.join(env.rootDir, 'login.html'));
});

app.get(['/admin', '/admin.html'], (req, res) => {
  res.sendFile(path.join(env.rootDir, 'admin.html'));
});

app.get(['/sw.js'], (req, res) => {
  res.sendFile(path.join(env.rootDir, 'sw.js'));
});

app.get(['/', '/index.html', '/:slug'], (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith(env.publicUploadBase)) {
    return res.status(404).end();
  }
  return res.sendFile(path.join(env.rootDir, 'index.html'));
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
