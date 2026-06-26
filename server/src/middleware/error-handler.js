// Lazy require — Sentry init server.js'de yapılıyor; modul yüklenmediyse no-op.
let Sentry = null;
try {
  if (process.env.SENTRY_DSN) {
    Sentry = require('@sentry/node');
  }
} catch (_) {
  Sentry = null;
}

module.exports = function errorHandler(error, req, res, next) {
  const status = error.status || 500;
  const payload = {
    message: error.message || 'Internal server error'
  };

  if (error.details) {
    payload.details = error.details;
  }

  if (process.env.NODE_ENV !== 'production' && error.stack) {
    payload.stack = error.stack;
  }

  // ✅ 5xx hatalarını Sentry'ye gönder (4xx kullanıcı hatası — gönderme)
  if (Sentry && status >= 500) {
    try {
      Sentry.captureException(error, {
        tags: { path: req.path, method: req.method },
        extra: { query: req.query }
      });
    } catch (_) { /* swallow */ }
  }

  res.status(status).json(payload);
};
