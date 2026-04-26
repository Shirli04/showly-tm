const app = require('./app');
const env = require('./config/env');
const { runMigrations } = require('./config/db');

async function start() {
  await runMigrations();
  app.listen(env.port, () => {
    console.log(`Showly server listening on port ${env.port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
