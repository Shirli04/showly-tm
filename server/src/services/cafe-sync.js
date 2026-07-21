// Kafe laptop kurulumu → Merkez sync API'ları.
// Tümü X-Cafe-Token ile kimlik doğrulanır (JWT kullanmıyor).
// Fırsatçı çalışır: laptop internete çıktığında ne bulursa çeker.

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, withTransaction } = require('../config/db');
const asyncHandler = require('../utils/async-handler');
const HttpError = require('../utils/http-error');
const { requireCafeToken } = require('../middleware/cafe-auth');
const env = require('../config/env');

const router = express.Router();

// Log ve backup yüklemeleri için özel klasör (upload klasörünün altında).
const cafeUploadDir = path.join(env.uploadDir, 'cafe-uploads');
fs.mkdirSync(cafeUploadDir, { recursive: true });

const cafeUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const cafeDir = path.join(cafeUploadDir, req.cafeInstall.id);
      fs.mkdirSync(cafeDir, { recursive: true });
      cb(null, cafeDir);
    },
    filename(req, file, cb) {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${safe}`);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 } // 100 MB log/backup üst sınırı
});

function getClientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.ip || 'unknown';
}

// --------------------------------------------------------------------------
// GET /api/cafe-sync/pull?since=<ISO timestamp>
// Kafenin kendi store'unun delta verisini döner: stores + products + parent
// categories + subcategories + images manifest.
// `since` boşsa full snapshot; verilirse sadece updated_at > since olanlar.
// --------------------------------------------------------------------------
router.get('/pull', requireCafeToken, asyncHandler(async (req, res) => {
  const storeId = req.cafeInstall.storeId;
  const since = req.query.since ? new Date(String(req.query.since)) : null;
  const sinceValid = since && !isNaN(since.getTime()) ? since.toISOString() : null;

  const storesQ = sinceValid
    ? await query(
        `SELECT * FROM stores WHERE id = $1 AND updated_at > $2::timestamptz`,
        [storeId, sinceValid]
      )
    : await query(`SELECT * FROM stores WHERE id = $1`, [storeId]);

  const productsQ = sinceValid
    ? await query(
        `SELECT * FROM products WHERE store_id = $1 AND updated_at > $2::timestamptz`,
        [storeId, sinceValid]
      )
    : await query(`SELECT * FROM products WHERE store_id = $1`, [storeId]);

  const parentCatsQ = await query(`SELECT * FROM parent_categories`);
  const subCatsQ = await query(`SELECT * FROM subcategories`);

  // Görsel manifesti — laptop hangilerini indirmesi gerektiğini bilsin.
  // Sadece image_url dolu olanları listele.
  const imagesManifest = productsQ.rows
    .filter((p) => p.image_url && String(p.image_url).trim() !== '')
    .map((p) => ({
      productId: p.id,
      url: p.image_url,
      updatedAt: p.updated_at
    }));

  // last_sync_at güncelle
  await query(
    `UPDATE cafe_installs
       SET last_sync_at = NOW(),
           last_seen_ip = $1,
           updated_at = NOW()
     WHERE id = $2`,
    [getClientIp(req), req.cafeInstall.id]
  );

  res.json({
    serverTime: new Date().toISOString(),
    since: sinceValid,
    isFullSnapshot: !sinceValid,
    stores: storesQ.rows,
    products: productsQ.rows,
    parentCategories: parentCatsQ.rows,
    subcategories: subCatsQ.rows,
    imagesManifest
  });
}));

// --------------------------------------------------------------------------
// POST /api/cafe-sync/heartbeat
// Body: { version, tabletsCount, waitersCount, callsToday, errorsLast24h,
//         avgResponseSeconds, disk, snapshot: {...} }
// --------------------------------------------------------------------------
router.post('/heartbeat', requireCafeToken, asyncHandler(async (req, res) => {
  const body = req.body || {};
  const snapshot = typeof body === 'object' ? body : {};

  const version = String(body.version || '').slice(0, 50);
  const tablets = Number.isFinite(Number(body.tabletsCount)) ? Number(body.tabletsCount) : 0;
  const waiters = Number.isFinite(Number(body.waitersCount)) ? Number(body.waitersCount) : 0;
  const ip = getClientIp(req);

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE cafe_installs
         SET last_heartbeat_at = NOW(),
             last_seen_ip = $1,
             version = COALESCE(NULLIF($2, ''), version),
             tablets_count = $3,
             waiters_count = $4,
             updated_at = NOW()
       WHERE id = $5`,
      [ip, version, tablets, waiters, req.cafeInstall.id]
    );

    await client.query(
      `INSERT INTO cafe_heartbeats (cafe_install_id, snapshot)
       VALUES ($1, $2::jsonb)`,
      [req.cafeInstall.id, JSON.stringify(snapshot)]
    );

    // Retention: bu install için son 500 heartbeat'i tut, eskilerini sil.
    // BIGSERIAL id ile hızlı — subquery ile kesin sıra.
    await client.query(
      `DELETE FROM cafe_heartbeats
       WHERE cafe_install_id = $1
         AND id NOT IN (
           SELECT id FROM cafe_heartbeats
           WHERE cafe_install_id = $1
           ORDER BY at DESC LIMIT 500
         )`,
      [req.cafeInstall.id]
    );
  });

  res.json({ ok: true, serverTime: new Date().toISOString() });
}));

// --------------------------------------------------------------------------
// GET /api/cafe-sync/commands
// Bekleyen komutları döner ve status'unu 'dispatched' yapar.
// Laptop bunları uygular, sonra her biri için ayrı ack çağırır.
// --------------------------------------------------------------------------
router.get('/commands', requireCafeToken, asyncHandler(async (req, res) => {
  const result = await withTransaction(async (client) => {
    const pending = await client.query(
      `SELECT id, kind, payload, created_at
         FROM cafe_commands
        WHERE cafe_install_id = $1 AND status = 'pending'
        ORDER BY created_at ASC
        LIMIT 50`,
      [req.cafeInstall.id]
    );

    if (pending.rows.length > 0) {
      const ids = pending.rows.map((r) => r.id);
      await client.query(
        `UPDATE cafe_commands
            SET status = 'dispatched', dispatched_at = NOW()
          WHERE id = ANY($1::uuid[])`,
        [ids]
      );
    }

    return pending.rows;
  });

  res.json({ commands: result });
}));

// --------------------------------------------------------------------------
// POST /api/cafe-sync/commands/:id/ack
// Body: { status: 'success' | 'failed', result: {...} }
// --------------------------------------------------------------------------
router.post('/commands/:id/ack', requireCafeToken, asyncHandler(async (req, res) => {
  const status = req.body?.status === 'success' ? 'success' : 'failed';
  const resultPayload = req.body?.result && typeof req.body.result === 'object'
    ? req.body.result
    : {};

  const update = await query(
    `UPDATE cafe_commands
        SET status = $1, result = $2::jsonb, acked_at = NOW()
      WHERE id = $3 AND cafe_install_id = $4
      RETURNING id`,
    [status, JSON.stringify(resultPayload), req.params.id, req.cafeInstall.id]
  );

  if (update.rowCount === 0) {
    throw new HttpError(404, 'Command not found for this cafe install');
  }

  res.json({ ok: true });
}));

// --------------------------------------------------------------------------
// GET /api/cafe-sync/version/latest
// Auto-update için: laptop kendi sürümü ile karşılaştırır, yeni varsa indirir.
// --------------------------------------------------------------------------
router.get('/version/latest', requireCafeToken, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT version, changelog, artifact_url, sha256, size_bytes, is_stable, released_at
       FROM cafe_releases
      WHERE is_stable = TRUE
      ORDER BY released_at DESC
      LIMIT 1`
  );

  if (result.rows.length === 0) {
    return res.json({ latest: null });
  }

  res.json({ latest: result.rows[0] });
}));

// --------------------------------------------------------------------------
// POST /api/cafe-sync/upload  (multipart, field: "file")
// Laptop log/backup snapshot yükleyebilir. USB alternatifi.
// Yalnızca disk yazar, herhangi bir işleme yapmaz (indirmek için manuel yol).
// --------------------------------------------------------------------------
router.post('/upload', requireCafeToken, cafeUpload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new HttpError(400, 'File is required');
  }

  res.status(201).json({
    ok: true,
    savedAs: req.file.filename,
    sizeBytes: req.file.size
  });
}));

module.exports = router;
