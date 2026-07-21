// Admin panelinden kafe kurulumlarını yönetme API'ları.
// Tümü JWT auth ile korunur, sadece admin/superadmin erişebilir.

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { query } = require('../config/db');
const asyncHandler = require('../utils/async-handler');
const HttpError = require('../utils/http-error');
const { requireAuth, requireRoleOrPermission } = require('../middleware/auth');

const router = express.Router();

// Sadece admin/superadmin — kafe yönetimi hassas (token oluşturma dahil).
router.use(requireAuth, requireRoleOrPermission('cafes'));

// Token formatı: cfi_<8char-prefix>.<32char-secret>
// Prefix DB'de plain (hızlı arama), secret bcrypt hash.
function generateToken() {
  const rand = crypto.randomBytes(28); // 224 bit
  const prefix = 'cfi_' + rand.slice(0, 4).toString('hex'); // cfi_ + 8 hex = 12 char total
  const secret = rand.slice(4).toString('base64url');
  return { full: `${prefix}.${secret}`, prefix, secret };
}

// -------- LIST --------
router.get('/cafes', asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT
      ci.id, ci.store_id, ci.label, ci.api_token_prefix,
      ci.version, ci.last_heartbeat_at, ci.last_sync_at, ci.last_seen_ip,
      ci.tablets_count, ci.waiters_count, ci.is_active,
      ci.created_at, ci.updated_at,
      s.name AS store_name, s.slug AS store_slug
    FROM cafe_installs ci
    LEFT JOIN stores s ON s.id = ci.store_id
    ORDER BY ci.created_at DESC
  `);

  const now = Date.now();
  const cafes = result.rows.map((r) => {
    const lastHb = r.last_heartbeat_at ? new Date(r.last_heartbeat_at).getTime() : 0;
    const ageMinutes = lastHb ? Math.floor((now - lastHb) / 60000) : null;
    let status = 'never'; // hiç bağlanmamış
    if (ageMinutes !== null) {
      if (ageMinutes < 60) status = 'online';
      else if (ageMinutes < 60 * 24) status = 'stale';
      else status = 'offline';
    }
    return { ...r, status, ageMinutes };
  });

  res.json({ cafes });
}));

// -------- CREATE --------
// Body: { storeId, label }
// Token PLAIN olarak SADECE burada döner. Bir daha görülmez.
router.post('/cafes', asyncHandler(async (req, res) => {
  const storeId = String(req.body?.storeId || '').trim();
  const label = String(req.body?.label || '').trim();

  if (!storeId) throw new HttpError(400, 'storeId is required');
  if (!label) throw new HttpError(400, 'label is required');

  // Store var mı kontrol
  const storeCheck = await query(`SELECT id FROM stores WHERE id = $1`, [storeId]);
  if (storeCheck.rowCount === 0) throw new HttpError(404, 'Store not found');

  const token = generateToken();
  const hash = await bcrypt.hash(token.secret, 10);

  const inserted = await query(
    `INSERT INTO cafe_installs (store_id, label, api_token_hash, api_token_prefix)
     VALUES ($1, $2, $3, $4)
     RETURNING id, store_id, label, api_token_prefix, is_active, created_at`,
    [storeId, label, hash, token.prefix]
  );

  res.status(201).json({
    cafe: inserted.rows[0],
    // Tokeni SADECE bir kez döndür — bir daha DB'den okunamaz.
    apiToken: token.full,
    warning: 'Bu tokeni şimdi kaydedin. Bir daha gösterilmeyecek.'
  });
}));

// -------- DETAILS --------
router.get('/cafes/:id', asyncHandler(async (req, res) => {
  const cafeQ = await query(
    `SELECT ci.*, s.name AS store_name, s.slug AS store_slug
       FROM cafe_installs ci
       LEFT JOIN stores s ON s.id = ci.store_id
      WHERE ci.id = $1`,
    [req.params.id]
  );
  if (cafeQ.rowCount === 0) throw new HttpError(404, 'Cafe install not found');

  const hbQ = await query(
    `SELECT id, snapshot, at
       FROM cafe_heartbeats
      WHERE cafe_install_id = $1
      ORDER BY at DESC
      LIMIT 20`,
    [req.params.id]
  );

  const cmdQ = await query(
    `SELECT id, kind, payload, status, result, created_at, dispatched_at, acked_at
       FROM cafe_commands
      WHERE cafe_install_id = $1
      ORDER BY created_at DESC
      LIMIT 30`,
    [req.params.id]
  );

  const cafe = cafeQ.rows[0];
  delete cafe.api_token_hash; // hash'i frontend'e sızdırma

  res.json({
    cafe,
    recentHeartbeats: hbQ.rows,
    recentCommands: cmdQ.rows
  });
}));

// -------- UPDATE (label / is_active) --------
router.patch('/cafes/:id', asyncHandler(async (req, res) => {
  const label = req.body?.label != null ? String(req.body.label).trim() : null;
  const isActive = typeof req.body?.isActive === 'boolean' ? req.body.isActive : null;

  if (label === null && isActive === null) {
    throw new HttpError(400, 'Nothing to update');
  }

  const sets = [];
  const params = [];
  if (label !== null) { params.push(label); sets.push(`label = $${params.length}`); }
  if (isActive !== null) { params.push(isActive); sets.push(`is_active = $${params.length}`); }
  sets.push(`updated_at = NOW()`);
  params.push(req.params.id);

  const result = await query(
    `UPDATE cafe_installs SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING id`,
    params
  );
  if (result.rowCount === 0) throw new HttpError(404, 'Cafe install not found');

  res.json({ ok: true });
}));

// -------- DELETE --------
router.delete('/cafes/:id', asyncHandler(async (req, res) => {
  const result = await query(`DELETE FROM cafe_installs WHERE id = $1 RETURNING id`, [req.params.id]);
  if (result.rowCount === 0) throw new HttpError(404, 'Cafe install not found');
  res.status(204).send();
}));

// -------- REGENERATE TOKEN --------
router.post('/cafes/:id/regenerate-token', asyncHandler(async (req, res) => {
  const exists = await query(`SELECT id FROM cafe_installs WHERE id = $1`, [req.params.id]);
  if (exists.rowCount === 0) throw new HttpError(404, 'Cafe install not found');

  const token = generateToken();
  const hash = await bcrypt.hash(token.secret, 10);

  await query(
    `UPDATE cafe_installs
        SET api_token_hash = $1, api_token_prefix = $2, updated_at = NOW()
      WHERE id = $3`,
    [hash, token.prefix, req.params.id]
  );

  res.json({
    apiToken: token.full,
    warning: 'Eski token artık geçersiz. Yeni tokeni laptop config dosyasına yapıştırın.'
  });
}));

// -------- ADD COMMAND --------
// Body: { kind, payload }
// Örn kind'lar: 'reload-menu', 'update-version', 'restart', 'set-setting'
router.post('/cafes/:id/commands', asyncHandler(async (req, res) => {
  const kind = String(req.body?.kind || '').trim();
  const payload = req.body?.payload && typeof req.body.payload === 'object'
    ? req.body.payload : {};

  if (!kind) throw new HttpError(400, 'kind is required');

  const cafeCheck = await query(`SELECT id FROM cafe_installs WHERE id = $1`, [req.params.id]);
  if (cafeCheck.rowCount === 0) throw new HttpError(404, 'Cafe install not found');

  const inserted = await query(
    `INSERT INTO cafe_commands (cafe_install_id, kind, payload)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id, kind, payload, status, created_at`,
    [req.params.id, kind, JSON.stringify(payload)]
  );

  res.status(201).json({ command: inserted.rows[0] });
}));

// -------- RELEASES: list --------
router.get('/releases', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT id, version, changelog, artifact_url, sha256, size_bytes, is_stable, released_at
       FROM cafe_releases
      ORDER BY released_at DESC
      LIMIT 100`
  );
  res.json({ releases: result.rows });
}));

// -------- RELEASES: create --------
router.post('/releases', asyncHandler(async (req, res) => {
  const version = String(req.body?.version || '').trim();
  const changelog = String(req.body?.changelog || '');
  const artifactUrl = String(req.body?.artifactUrl || '').trim();
  const sha256 = String(req.body?.sha256 || '').trim();
  const sizeBytes = Number(req.body?.sizeBytes || 0);
  const isStable = Boolean(req.body?.isStable);

  if (!version || !artifactUrl || !sha256) {
    throw new HttpError(400, 'version, artifactUrl and sha256 are required');
  }

  const inserted = await query(
    `INSERT INTO cafe_releases (version, changelog, artifact_url, sha256, size_bytes, is_stable)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, version, is_stable, released_at`,
    [version, changelog, artifactUrl, sha256, sizeBytes, isStable]
  );

  res.status(201).json({ release: inserted.rows[0] });
}));

module.exports = router;
