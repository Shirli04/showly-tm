const env = require('./config/env');

// ✅ Sentry — error tracking (DSN ayarlanmadıysa pasif kalır).
// require('./app')'den ÖNCE init edilmeli ki Express transactions yakalansın.
let Sentry = null;
if (env.sentryDsn) {
  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn: env.sentryDsn,
      environment: env.sentryEnvironment,
      tracesSampleRate: env.sentryTracesSampleRate,
      sendDefaultPii: false
    });
    console.log('[Sentry] Initialized for env:', env.sentryEnvironment);
  } catch (err) {
    console.warn('[Sentry] Init failed:', err.message, '— continuing without Sentry');
    Sentry = null;
  }
}

const app = require('./app');
const { runMigrations } = require('./config/db');

// Global error guards — Sentry'ye yolla, sonra normal flow
process.on('unhandledRejection', (reason) => {
  if (Sentry) Sentry.captureException(reason);
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  if (Sentry) Sentry.captureException(err);
  console.error('Uncaught Exception:', err);
});

async function start() {
  await runMigrations();
  app.listen(env.port, () => {
    console.log(`Showly server listening on port ${env.port}`);
  });
}

start().catch((error) => {
  if (Sentry) Sentry.captureException(error);
  console.error('Failed to start server:', error);
  process.exit(1);
});
