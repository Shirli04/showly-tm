const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const HttpError = require('../utils/http-error');
const slugify = require('../utils/slugify');
const {
  deepReplaceFieldValueMarkers,
  parseMoney,
  formatMoney,
  ensureArray
} = require('../utils/helpers');

const collectionToResource = {
  stores: 'stores',
  products: 'products',
  orders: 'orders',
  users: 'users',
  parentCategories: 'parentCategories',
  subcategories: 'subcategories',
  reservationPackages: 'reservationPackages',
  settings: 'settings',
  categories: 'legacyCategories'
};

function normalizeSettingsDocument(row) {
  return {
    id: row.key,
    ...(row.value || {}),
    updatedAt: row.updated_at
  };
}

function normalizeParentCategory(row) {
  return {
    id: row.id,
    name: row.name,
    name_ru: row.name_ru || '',
    name_en: row.name_en || '',
    icon: row.icon || 'fa-tag',
    order: row.sort_order || 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeSubcategory(row) {
  return {
    id: row.id,
    parentId: row.parent_category_id,
    name: row.name,
    name_ru: row.name_ru || '',
    name_en: row.name_en || '',
    order: row.sort_order || 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeStore(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || '',
    category: row.subcategory_id || row.parent_category_id || '',
    customBannerText: row.custom_banner_text || '',
    tiktok: row.tiktok_url || '',
    instagram: row.instagram_url || '',
    phone: row.phone || '',
    location: row.location || '',
    orderPhone: row.order_phone || '',
    hasReservation: row.has_reservation,
    hasBron: row.has_bron,
    restaurantSchemaUrl: row.restaurant_schema_url || '',
    featuredProductsEnabled: row.featured_products_enabled,
    featuredProductIds: ensureArray(row.featured_product_ids),
    readyMealProductsEnabled: row.ready_meal_products_enabled,
    readyMealProductIds: ensureArray(row.ready_meal_product_ids),
    tables: ensureArray(row.tables),
    views: row.views || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeProduct(row) {
  return {
    id: row.id,
    storeId: row.store_id,
    title: row.title,
    name_ru: row.name_ru || '',
    name_en: row.name_en || '',
    description: row.description || '',
    desc_ru: row.desc_ru || '',
    desc_en: row.desc_en || '',
    material: row.material || '',
    category: row.category || '',
    category_ru: row.category_ru || '',
    category_en: row.category_en || '',
    price: formatMoney(row.price),
    originalPrice: row.discounted_price != null ? formatMoney(row.discounted_price) : '',
    isOnSale: Boolean(row.is_on_sale),
    imageUrl: row.image_url || '',
    imagePublicId: row.image_public_id || '',
    variants: ensureArray(row.variants),
    views: row.views || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeOrder(row) {
  return {
    id: row.id,
    orderType: row.order_type,
    storeId: row.store_id,
    storeName: row.store_name || '',
    customer: {
      name: row.customer_name || '',
      phone: row.customer_phone || '',
      address: row.customer_address || '',
      note: row.customer_note || ''
    },
    items: ensureArray(row.items),
    total: row.total_label || formatMoney(row.total_amount),
    totalPrice: row.total_amount != null ? Number(row.total_amount) : 0,
    status: row.status,
    orderNumber: row.order_number || '',
    eventType: row.event_type || '',
    guestCount: row.guest_count || 0,
    tableNumber: row.table_number || '',
    date: row.created_at,
    timestamp: row.created_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeUser(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    permissions: ensureArray(row.permissions),
    storeId: row.store_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeReservationPackage(row) {
  return {
    id: row.id,
    storeId: row.store_id,
    totalPrice: Number(row.total_price || 0),
    serviceTypes: ensureArray(row.service_types),
    serviceFeatures: ensureArray(row.service_features),
    menuItems: ensureArray(row.menu_items),
    capacities: ensureArray(row.capacities),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseCategoryReference(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return { parentCategoryId: null, subcategoryId: null };
  }

  if (raw.startsWith('parent:')) {
    return { parentCategoryId: raw.slice(7), subcategoryId: null };
  }

  if (raw.startsWith('sub:')) {
    return { parentCategoryId: null, subcategoryId: raw.slice(4) };
  }

  return { parentCategoryId: raw, subcategoryId: null };
}

function buildListQuery({ table, filters, orderMap, defaultOrder }, requestQuery) {
  const where = [];
  const values = [];
  let requestedFilters = [];

  if (requestQuery.filters) {
    try {
      requestedFilters = JSON.parse(requestQuery.filters);
    } catch (error) {
      requestedFilters = [];
    }
  } else if (requestQuery.whereField && requestQuery.whereValue != null) {
    requestedFilters = [{ field: requestQuery.whereField, value: requestQuery.whereValue }];
  }

  requestedFilters.forEach((filter) => {
    if (!filter || !filters[filter.field]) return;
    values.push(filter.value);
    where.push(`${filters[filter.field]} = $${values.length}`);
  });

  const orderField = orderMap[requestQuery.orderBy] || defaultOrder.field;
  const orderDirection = String(requestQuery.orderDir || defaultOrder.direction || 'asc').toLowerCase() === 'desc'
    ? 'DESC'
    : 'ASC';

  const sql = `
    SELECT *
    FROM ${table}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${orderField} ${orderDirection}
  `;

  return { sql, values };
}

async function listStores(requestQuery) {
  const { sql, values } = buildListQuery({
    table: 'stores',
    filters: {
      id: 'id',
      slug: 'slug',
      category: 'COALESCE(subcategory_id, parent_category_id)'
    },
    orderMap: { createdAt: 'created_at', name: 'name', views: 'views' },
    defaultOrder: { field: 'created_at', direction: 'desc' }
  }, requestQuery);
  const result = await query(sql, values);
  return result.rows.map(normalizeStore);
}

async function listProducts(requestQuery) {
  const { sql, values } = buildListQuery({
    table: 'products',
    filters: { id: 'id', storeId: 'store_id', category: 'category' },
    orderMap: { createdAt: 'created_at', title: 'title', price: 'price' },
    defaultOrder: { field: 'created_at', direction: 'desc' }
  }, requestQuery);
  const result = await query(sql, values);
  return result.rows.map(normalizeProduct);
}

async function listOrders(requestQuery) {
  const { sql, values } = buildListQuery({
    table: 'orders',
    filters: { id: 'id', storeId: 'store_id', orderType: 'order_type', status: 'status' },
    orderMap: { date: 'created_at', timestamp: 'created_at', createdAt: 'created_at' },
    defaultOrder: { field: 'created_at', direction: 'desc' }
  }, requestQuery);
  const result = await query(sql, values);
  return result.rows.map(normalizeOrder);
}

async function listUsers(requestQuery) {
  const { sql, values } = buildListQuery({
    table: 'users',
    filters: { id: 'id', username: 'username', role: 'role' },
    orderMap: { createdAt: 'created_at', username: 'username' },
    defaultOrder: { field: 'created_at', direction: 'desc' }
  }, requestQuery);
  const result = await query(sql, values);
  return result.rows.map(normalizeUser);
}

async function listParentCategories(requestQuery) {
  const { sql, values } = buildListQuery({
    table: 'parent_categories',
    filters: { id: 'id' },
    orderMap: { order: 'sort_order', createdAt: 'created_at' },
    defaultOrder: { field: 'sort_order', direction: 'asc' }
  }, requestQuery);
  const result = await query(sql, values);
  return result.rows.map(normalizeParentCategory);
}

async function listSubcategories(requestQuery) {
  const { sql, values } = buildListQuery({
    table: 'subcategories',
    filters: { id: 'id', parentId: 'parent_category_id' },
    orderMap: { order: 'sort_order', createdAt: 'created_at' },
    defaultOrder: { field: 'sort_order', direction: 'asc' }
  }, requestQuery);
  const result = await query(sql, values);
  return result.rows.map(normalizeSubcategory);
}

async function listReservationPackages(requestQuery) {
  const { sql, values } = buildListQuery({
    table: 'reservation_packages',
    filters: { id: 'id', storeId: 'store_id' },
    orderMap: { createdAt: 'created_at', updatedAt: 'updated_at' },
    defaultOrder: { field: 'created_at', direction: 'desc' }
  }, requestQuery);
  const result = await query(sql, values);
  return result.rows.map(normalizeReservationPackage);
}

async function listSettings() {
  const result = await query('SELECT * FROM settings ORDER BY key ASC');
  return result.rows.map(normalizeSettingsDocument);
}

async function listLegacyCategories() {
  return [];
}

async function getStore(id) {
  const result = await query('SELECT * FROM stores WHERE id::text = $1 OR slug = $1 LIMIT 1', [id]);
  if (!result.rows[0]) return null;
  return normalizeStore(result.rows[0]);
}

async function getProduct(id) {
  const result = await query('SELECT * FROM products WHERE id = $1 LIMIT 1', [id]);
  return result.rows[0] ? normalizeProduct(result.rows[0]) : null;
}

async function getOrder(id) {
  const result = await query('SELECT * FROM orders WHERE id = $1 LIMIT 1', [id]);
  return result.rows[0] ? normalizeOrder(result.rows[0]) : null;
}

async function getUser(id) {
  const result = await query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
  return result.rows[0] ? normalizeUser(result.rows[0]) : null;
}

async function getUserWithPasswordByUsername(username) {
  const result = await query('SELECT * FROM users WHERE username = $1 LIMIT 1', [username]);
  return result.rows[0] || null;
}

async function getParentCategory(id) {
  const result = await query('SELECT * FROM parent_categories WHERE id = $1 LIMIT 1', [id]);
  return result.rows[0] ? normalizeParentCategory(result.rows[0]) : null;
}

async function getSubcategory(id) {
  const result = await query('SELECT * FROM subcategories WHERE id = $1 LIMIT 1', [id]);
  return result.rows[0] ? normalizeSubcategory(result.rows[0]) : null;
}

async function getReservationPackage(id) {
  const result = await query('SELECT * FROM reservation_packages WHERE id = $1 LIMIT 1', [id]);
  return result.rows[0] ? normalizeReservationPackage(result.rows[0]) : null;
}

async function getSetting(key) {
  const result = await query('SELECT * FROM settings WHERE key = $1 LIMIT 1', [key]);
  return result.rows[0] ? normalizeSettingsDocument(result.rows[0]) : null;
}

async function upsertStore(payload, id) {
  const data = deepReplaceFieldValueMarkers(payload);
  const current = id ? await getStore(id) : null;
  const source = current ? { ...current, ...data } : data;
  const categoryRef = parseCategoryReference(data.category);
  const normalized = {
    id: id || data.id,
    name: source.name,
    slug: source.slug || slugify(source.name),
    description: source.description || '',
    parentCategoryId: data.category !== undefined ? categoryRef.parentCategoryId : parseCategoryReference(source.category).parentCategoryId,
    subcategoryId: data.category !== undefined ? categoryRef.subcategoryId : parseCategoryReference(source.category).subcategoryId,
    customBannerText: source.customBannerText || '',
    tiktok: source.tiktok || '',
    instagram: source.instagram || '',
    phone: source.phone || '',
    location: source.location || '',
    orderPhone: source.orderPhone || '',
    hasReservation: Boolean(source.hasReservation),
    hasBron: Boolean(source.hasBron),
    restaurantSchemaUrl: source.restaurantSchemaUrl || '',
    featuredProductsEnabled: Boolean(source.featuredProductsEnabled),
    featuredProductIds: ensureArray(source.featuredProductIds),
    readyMealProductsEnabled: Boolean(source.readyMealProductsEnabled),
    readyMealProductIds: ensureArray(source.readyMealProductIds),
    tables: ensureArray(source.tables),
    viewsIncrement: data.views && data.views.__increment ? Number(data.views.__increment) : 0,
    viewsValue: typeof data.views === 'number' ? data.views : (current ? current.views : null)
  };

  if (!normalized.name) {
    throw new HttpError(400, 'Store name is required');
  }

  const result = await query(`
    INSERT INTO stores (
      id, name, slug, description, parent_category_id, subcategory_id,
      custom_banner_text, tiktok_url, instagram_url, phone, location, order_phone,
      has_reservation, has_bron, restaurant_schema_url,
      featured_products_enabled, featured_product_ids,
      ready_meal_products_enabled, ready_meal_product_ids,
      tables, views
    ) VALUES (
      COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11, $12,
      $13, $14, $15,
      $16, $17::jsonb,
      $18, $19::jsonb,
      $20::jsonb, COALESCE($21, 0)
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      slug = EXCLUDED.slug,
      description = EXCLUDED.description,
      parent_category_id = EXCLUDED.parent_category_id,
      subcategory_id = EXCLUDED.subcategory_id,
      custom_banner_text = EXCLUDED.custom_banner_text,
      tiktok_url = EXCLUDED.tiktok_url,
      instagram_url = EXCLUDED.instagram_url,
      phone = EXCLUDED.phone,
      location = EXCLUDED.location,
      order_phone = EXCLUDED.order_phone,
      has_reservation = EXCLUDED.has_reservation,
      has_bron = EXCLUDED.has_bron,
      restaurant_schema_url = EXCLUDED.restaurant_schema_url,
      featured_products_enabled = EXCLUDED.featured_products_enabled,
      featured_product_ids = EXCLUDED.featured_product_ids,
      ready_meal_products_enabled = EXCLUDED.ready_meal_products_enabled,
      ready_meal_product_ids = EXCLUDED.ready_meal_product_ids,
      tables = EXCLUDED.tables,
      views = CASE
        WHEN $22 <> 0 THEN stores.views + $22
        WHEN $21 IS NOT NULL THEN $21
        ELSE stores.views
      END,
      updated_at = NOW()
    RETURNING *
  `, [
    normalized.id || null,
    normalized.name,
    normalized.slug,
    normalized.description,
    normalized.parentCategoryId,
    normalized.subcategoryId,
    normalized.customBannerText,
    normalized.tiktok,
    normalized.instagram,
    normalized.phone,
    normalized.location,
    normalized.orderPhone,
    normalized.hasReservation,
    normalized.hasBron,
    normalized.restaurantSchemaUrl,
    normalized.featuredProductsEnabled,
    JSON.stringify(normalized.featuredProductIds),
    normalized.readyMealProductsEnabled,
    JSON.stringify(normalized.readyMealProductIds),
    JSON.stringify(normalized.tables),
    normalized.viewsValue,
    normalized.viewsIncrement
  ]);

  return normalizeStore(result.rows[0]);
}

async function upsertProduct(payload, id) {
  const data = deepReplaceFieldValueMarkers(payload);
  const current = id ? await getProduct(id) : null;
  const source = current ? { ...current, ...data } : data;
  if (!source.title || !source.storeId) {
    throw new HttpError(400, 'Product title and storeId are required');
  }

  const result = await query(`
    INSERT INTO products (
      id, store_id, title, name_ru, name_en,
      description, desc_ru, desc_en, material,
      category, category_ru, category_en,
      price, discounted_price, is_on_sale,
      image_url, image_public_id, variants, views
    ) VALUES (
      COALESCE($1, gen_random_uuid()), $2, $3, $4, $5,
      $6, $7, $8, $9,
      $10, $11, $12,
      $13, $14, $15,
      $16, $17, $18::jsonb, COALESCE($19, 0)
    )
    ON CONFLICT (id) DO UPDATE SET
      store_id = EXCLUDED.store_id,
      title = EXCLUDED.title,
      name_ru = EXCLUDED.name_ru,
      name_en = EXCLUDED.name_en,
      description = EXCLUDED.description,
      desc_ru = EXCLUDED.desc_ru,
      desc_en = EXCLUDED.desc_en,
      material = EXCLUDED.material,
      category = EXCLUDED.category,
      category_ru = EXCLUDED.category_ru,
      category_en = EXCLUDED.category_en,
      price = EXCLUDED.price,
      discounted_price = EXCLUDED.discounted_price,
      is_on_sale = EXCLUDED.is_on_sale,
      image_url = EXCLUDED.image_url,
      image_public_id = EXCLUDED.image_public_id,
      variants = EXCLUDED.variants,
      views = COALESCE($19, products.views),
      updated_at = NOW()
    RETURNING *
  `, [
    id || data.id || null,
    source.storeId,
    source.title,
    source.name_ru || '',
    source.name_en || '',
    source.description || '',
    source.desc_ru || '',
    source.desc_en || '',
    source.material || '',
    source.category || '',
    source.category_ru || '',
    source.category_en || '',
    parseMoney(source.price) || 0,
    parseMoney(source.originalPrice),
    Boolean(source.isOnSale),
    source.imageUrl || '',
    source.imagePublicId || '',
    JSON.stringify(ensureArray(source.variants)),
    typeof data.views === 'number' ? data.views : (current ? current.views : null)
  ]);

  return normalizeProduct(result.rows[0]);
}

async function upsertOrder(payload, id) {
  const data = deepReplaceFieldValueMarkers(payload);
  const current = id ? await getOrder(id) : null;
  const source = current ? { ...current, ...data, customer: { ...(current.customer || {}), ...(data.customer || {}) } } : data;
  const customer = source.customer || {};
  const items = ensureArray(source.items);
  const totalAmount = parseMoney(source.total || source.totalPrice) || 0;
  const totalLabel = source.total || formatMoney(totalAmount);

  const row = await query(`
    INSERT INTO orders (
      id, order_type, store_id, store_name,
      customer_name, customer_phone, customer_address, customer_note,
      items, total_amount, total_label, status, order_number,
      event_type, guest_count, table_number
    ) VALUES (
      COALESCE($1, gen_random_uuid()), $2, $3, $4,
      $5, $6, $7, $8,
      $9::jsonb, $10, $11, $12, $13,
      $14, $15, $16
    )
    ON CONFLICT (id) DO UPDATE SET
      order_type = EXCLUDED.order_type,
      store_id = EXCLUDED.store_id,
      store_name = EXCLUDED.store_name,
      customer_name = EXCLUDED.customer_name,
      customer_phone = EXCLUDED.customer_phone,
      customer_address = EXCLUDED.customer_address,
      customer_note = EXCLUDED.customer_note,
      items = EXCLUDED.items,
      total_amount = EXCLUDED.total_amount,
      total_label = EXCLUDED.total_label,
      status = EXCLUDED.status,
      order_number = COALESCE(EXCLUDED.order_number, orders.order_number),
      event_type = EXCLUDED.event_type,
      guest_count = EXCLUDED.guest_count,
      table_number = EXCLUDED.table_number,
      updated_at = NOW()
    RETURNING *
  `, [
    id || data.id || null,
    source.orderType || 'order',
    source.storeId || null,
    source.storeName || null,
    customer.name || '',
    customer.phone || '',
    customer.address || '',
    customer.note || '',
    JSON.stringify(items),
    totalAmount,
    totalLabel,
    source.status || 'pending',
    source.orderNumber || null,
    source.eventType || null,
    source.guestCount || null,
    source.tableNumber || null
  ]);

  return normalizeOrder(row.rows[0]);
}

async function upsertParentCategory(payload, id) {
  const data = deepReplaceFieldValueMarkers(payload);
  if (!data.name) {
    throw new HttpError(400, 'Parent category name is required');
  }

  const result = await query(`
    INSERT INTO parent_categories (id, name, name_ru, name_en, icon, sort_order)
    VALUES (COALESCE($1, $7), $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      name_ru = EXCLUDED.name_ru,
      name_en = EXCLUDED.name_en,
      icon = EXCLUDED.icon,
      sort_order = EXCLUDED.sort_order,
      updated_at = NOW()
    RETURNING *
  `, [id || data.id || null, data.name, data.name_ru || '', data.name_en || '', data.icon || 'fa-tag', Number(data.order || 1), slugify(data.name)]);
  return normalizeParentCategory(result.rows[0]);
}

async function upsertSubcategory(payload, id) {
  const data = deepReplaceFieldValueMarkers(payload);
  if (!data.name || !data.parentId) {
    throw new HttpError(400, 'Subcategory name and parentId are required');
  }

  const result = await query(`
    INSERT INTO subcategories (id, parent_category_id, name, name_ru, name_en, sort_order)
    VALUES (COALESCE($1, $7), $2, $3, $4, $5, $6)
    ON CONFLICT (id) DO UPDATE SET
      parent_category_id = EXCLUDED.parent_category_id,
      name = EXCLUDED.name,
      name_ru = EXCLUDED.name_ru,
      name_en = EXCLUDED.name_en,
      sort_order = EXCLUDED.sort_order,
      updated_at = NOW()
    RETURNING *
  `, [id || data.id || null, data.parentId, data.name, data.name_ru || '', data.name_en || '', Number(data.order || 1), slugify(data.name)]);
  return normalizeSubcategory(result.rows[0]);
}

async function upsertReservationPackage(payload, id) {
  const data = deepReplaceFieldValueMarkers(payload);
  if (!data.storeId) {
    throw new HttpError(400, 'storeId is required');
  }

  const result = await query(`
    INSERT INTO reservation_packages (
      id, store_id, total_price, service_types, service_features, menu_items, capacities
    ) VALUES (
      COALESCE($1, gen_random_uuid()), $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      store_id = EXCLUDED.store_id,
      total_price = EXCLUDED.total_price,
      service_types = EXCLUDED.service_types,
      service_features = EXCLUDED.service_features,
      menu_items = EXCLUDED.menu_items,
      capacities = EXCLUDED.capacities,
      updated_at = NOW()
    RETURNING *
  `, [
    id || data.id || null,
    data.storeId,
    Number(data.totalPrice || 0),
    JSON.stringify(ensureArray(data.serviceTypes)),
    JSON.stringify(ensureArray(data.serviceFeatures)),
    JSON.stringify(ensureArray(data.menuItems)),
    JSON.stringify(ensureArray(data.capacities))
  ]);
  return normalizeReservationPackage(result.rows[0]);
}

async function upsertSettings(payload, id) {
  const data = deepReplaceFieldValueMarkers(payload);
  const key = id || data.id || 'general';
  const result = await query(`
    INSERT INTO settings (key, value)
    VALUES ($1, $2::jsonb)
    ON CONFLICT (key) DO UPDATE SET
      value = settings.value || EXCLUDED.value,
      updated_at = NOW()
    RETURNING *
  `, [key, JSON.stringify(data)]);
  return normalizeSettingsDocument(result.rows[0]);
}

async function upsertUser(payload, id) {
  const data = deepReplaceFieldValueMarkers(payload);
  const current = id ? await getUser(id) : null;
  const source = current ? { ...current, ...data } : data;
  if (!source.username) {
    throw new HttpError(400, 'Username is required');
  }

  let passwordHash = data.passwordHash || data.password_hash || null;
  if (data.password) {
    passwordHash = data.password.startsWith('$2') ? data.password : await bcrypt.hash(data.password, 10);
  }

  if (!passwordHash) {
    const existing = id ? await query('SELECT password_hash FROM users WHERE id = $1', [id]) : { rows: [] };
    passwordHash = existing.rows[0] ? existing.rows[0].password_hash : null;
  }

  if (!passwordHash) {
    throw new HttpError(400, 'Password is required');
  }

  const normalizedRole = source.role || 'admin';
  const normalizedStoreId = source.storeId || source.store_id || null;
  const requiresStore = normalizedRole !== 'admin' && normalizedRole !== 'superadmin';
  if (requiresStore && !normalizedStoreId) {
    throw new HttpError(400, 'storeId is required for this role');
  }

  const result = await query(`
    INSERT INTO users (id, username, password_hash, role, permissions, store_id)
    VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5::jsonb, $6)
    ON CONFLICT (id) DO UPDATE SET
      username = EXCLUDED.username,
      password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
      role = EXCLUDED.role,
      permissions = EXCLUDED.permissions,
      store_id = EXCLUDED.store_id,
      updated_at = NOW()
    RETURNING *
  `, [
    id || data.id || null,
    source.username,
    passwordHash,
    normalizedRole,
    JSON.stringify(ensureArray(source.permissions)),
    normalizedStoreId
  ]);
  return normalizeUser(result.rows[0]);
}

async function deleteByResource(resource, id) {
  const tableMap = {
    stores: 'stores',
    products: 'products',
    orders: 'orders',
    users: 'users',
    parentCategories: 'parent_categories',
    subcategories: 'subcategories',
    reservationPackages: 'reservation_packages'
  };

  const table = tableMap[resource];
  if (!table) {
    throw new HttpError(400, 'Delete is not supported for this resource');
  }

  await query(`DELETE FROM ${table} WHERE id = $1`, [id]);
}

async function listResource(resource, requestQuery) {
  switch (resource) {
    case 'stores': return listStores(requestQuery);
    case 'products': return listProducts(requestQuery);
    case 'orders': return listOrders(requestQuery);
    case 'users': return listUsers(requestQuery);
    case 'parentCategories': return listParentCategories(requestQuery);
    case 'subcategories': return listSubcategories(requestQuery);
    case 'reservationPackages': return listReservationPackages(requestQuery);
    case 'settings': return listSettings();
    case 'legacyCategories': return listLegacyCategories();
    default: throw new HttpError(404, 'Unknown resource');
  }
}

async function getResource(resource, id) {
  switch (resource) {
    case 'stores': return getStore(id);
    case 'products': return getProduct(id);
    case 'orders': return getOrder(id);
    case 'users': return getUser(id);
    case 'parentCategories': return getParentCategory(id);
    case 'subcategories': return getSubcategory(id);
    case 'reservationPackages': return getReservationPackage(id);
    case 'settings': return getSetting(id);
    case 'legacyCategories': return null;
    default: throw new HttpError(404, 'Unknown resource');
  }
}

async function upsertResource(resource, payload, id) {
  switch (resource) {
    case 'stores': return upsertStore(payload, id);
    case 'products': return upsertProduct(payload, id);
    case 'orders': return upsertOrder(payload, id);
    case 'users': return upsertUser(payload, id);
    case 'parentCategories': return upsertParentCategory(payload, id);
    case 'subcategories': return upsertSubcategory(payload, id);
    case 'reservationPackages': return upsertReservationPackage(payload, id);
    case 'settings': return upsertSettings(payload, id);
    default: throw new HttpError(404, 'Unknown resource');
  }
}

async function commitBatch(operations) {
  for (const operation of operations) {
    const resource = collectionToResource[operation.collection] || operation.collection;

    if (operation.type === 'delete') {
      await deleteByResource(resource, operation.id);
      continue;
    }

    if (operation.type === 'set' || operation.type === 'update') {
      await upsertResource(resource, operation.data, operation.id);
    }
  }

  return true;
}

async function getCatalogBootstrap() {
  const [stores, parentCategories, subcategories, settings] = await Promise.all([
    listStores({}),
    listParentCategories({}),
    listSubcategories({}),
    getSetting('general')
  ]);

  return {
    stores,
    parentCategories,
    subcategories,
    categories: [],
    settings: settings || { id: 'general' }
  };
}

module.exports = {
  collectionToResource,
  listResource,
  getResource,
  upsertResource,
  deleteByResource,
  getUserWithPasswordByUsername,
  getCatalogBootstrap,
  commitBatch
};

