const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const rootDir = path.resolve(__dirname, '..', '..', '..');
const defaultUploadDir = process.platform === 'win32'
  ? path.join(rootDir, 'uploads')
  : '/var/www/uploads';

module.exports = {
  rootDir,
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  uploadDir: process.env.UPLOAD_DIR || defaultUploadDir,
  publicUploadBase: process.env.PUBLIC_UPLOAD_BASE || '/uploads',
  corsOrigin: process.env.CORS_ORIGIN || '*'
};
