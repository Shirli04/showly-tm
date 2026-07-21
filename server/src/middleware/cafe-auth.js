const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const HttpError = require('../utils/http-error');

// Kafe laptop kurulumu, kendi API token'ı ile kimlik doğrular.
// Format: header "X-Cafe-Token: cfi_<prefix>.<secret>"
//   - prefix (ilk 8 karakter): DB'de plain saklı, hızlı arama için
//   - secret (kalan): bcrypt ile hashlenmiş, karşılaştırma orada
// Bu, JWT'den ayrı bir yolu — laptop internete ne zaman çıkarsa
// tokeni kullanır, süresi dolmaz. İptal etmek için panelden is_active=false.

async function requireCafeToken(req, res, next) {
  try {
    const raw = String(req.headers['x-cafe-token'] || '').trim();
    if (!raw || !raw.startsWith('cfi_')) {
      throw new HttpError(401, 'Cafe token required');
    }

    const dotIndex = raw.indexOf('.');
    if (dotIndex < 5) {
      throw new HttpError(401, 'Invalid cafe token format');
    }

    const prefix = raw.slice(0, dotIndex);
    const secret = raw.slice(dotIndex + 1);

    const result = await query(
      `SELECT id, store_id, label, api_token_hash, is_active
       FROM cafe_installs
       WHERE api_token_prefix = $1
       LIMIT 1`,
      [prefix]
    );
    const install = result.rows[0];

    if (!install || !install.is_active) {
      throw new HttpError(401, 'Cafe install not recognized or disabled');
    }

    const isValid = await bcrypt.compare(secret, install.api_token_hash);
    if (!isValid) {
      throw new HttpError(401, 'Invalid cafe token');
    }

    req.cafeInstall = {
      id: install.id,
      storeId: install.store_id,
      label: install.label
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { requireCafeToken };
