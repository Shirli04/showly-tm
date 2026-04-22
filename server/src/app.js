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
  getCatalogBootstrap,
  commitBatch
} = require('./services/repository');

const app = express();

app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin, credentials: true }));
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

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    throw new HttpError(400, 'Username and password are required');
  }

  const user = await getUserWithPasswordByUsername(username.trim());
  if (!user) {
    throw new HttpError(401, 'Invalid username or password');
  }

  const hash = user.password_hash || '';
  const isHash = hash.startsWith('$2');
  const isValid = isHash ? await bcrypt.compare(password, hash) : password === hash;

  if (!isValid) {
    throw new HttpError(401, 'Invalid username or password');
  }

  const payload = {
    id: user.id,
    username: user.username,
    role: user.role,
    permissions: Array.isArray(user.permissions) ? user.permissions : []
  };

  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: '7d' });
  res.json({ token, user: payload });
}));

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.get('/api/catalog/bootstrap', asyncHandler(async (req, res) => {
  res.json(await getCatalogBootstrap());
}));

app.post('/api/uploads', requireAuth, upload.single('file'), asyncHandler(async (req, res) => {
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

  const absolutePath = resolveUploadFile(filePath);
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

    const stores = await listResource('stores', {});
    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let i = 0; i < jsonData.length; i++) {
      const row = jsonData[i];
      try {
        const storeName = String(row['Magazyn Ady'] || row['Mağaza Adı'] || row['Magaza Adi'] || '').trim();
        if (!storeName) { errorCount++; errors.push(`Satır ${i + 2}: Mağaza adı boş`); continue; }

        const store = stores.find(s => {
          const sName = String(s.name || '').toLowerCase();
          const sSlug = String(s.slug || '').toLowerCase();
          return sName === storeName.toLowerCase() || sSlug === storeName.toLowerCase();
        });
        if (!store) { errorCount++; errors.push(`Satır ${i + 2}: "${storeName}" mağazası bulunamadı`); continue; }

        const title = String(row['Haryt Ady (TM)'] || row['Haryt Ady'] || row['Ürün Adı'] || '').trim();
        if (!title) { errorCount++; errors.push(`Satır ${i + 2}: Ürün adı boş`); continue; }

        const normalPrice = String(row['Baha'] || row['Normal Fiyat'] || '0').trim().replace('TMT', '').trim();
        const discountedPrice = String(row['Arzanladyş Bahasy'] || row['İndirimli Fiyat'] || '').trim().replace('TMT', '').trim();
        const isOnSale = discountedPrice && !isNaN(discountedPrice) && parseFloat(discountedPrice) > 0;

        const productData = {
          storeId: store.id,
          title,
          description: String(row['Düşündiriş (TM)'] || row['Düşündiriş'] || row['Açıklama'] || '').trim(),
          name_ru: String(row['Haryt Ady (RU)'] || '').trim(),
          name_en: String(row['Haryt Ady (EN)'] || '').trim(),
          desc_ru: String(row['Düşündiriş (RU)'] || '').trim(),
          desc_en: String(row['Düşündiriş (EN)'] || '').trim(),
          price: `${normalPrice} TMT`,
          originalPrice: isOnSale ? `${discountedPrice} TMT` : '',
          isOnSale,
          category: String(row['Kategoriýa (TM)'] || row['Kategoriýa'] || row['Kategori'] || '').trim(),
          category_ru: String(row['Kategoriýa (RU)'] || '').trim(),
          category_en: String(row['Kategoriýa (EN)'] || '').trim(),
          material: String(row['Material'] || row['Malzeme'] || '').trim(),
          imageUrl: String(row['Surat URL'] || row['Resim URL'] || '').trim(),
        };

        const existingId = row['Haryt ID'] || row['Product ID'];
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

  const writeGuards = options.superAdminOnly
    ? [requireAuth, requireSuperAdmin]
    : [requireAuth, requireRoleOrPermission(permissionForResource(resource))];

  const createHandler = asyncHandler(async (req, res) => {
    res.status(201).json(await upsertResource(resource, req.body));
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

createCrudRoutes('/api/stores', 'stores');
createCrudRoutes('/api/products', 'products');
createCrudRoutes('/api/orders', 'orders', { publicCreate: true });
createCrudRoutes('/api/users', 'users', { superAdminOnly: true });
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
