const fs = require('fs');
const path = require('path');
const multer = require('multer');
const env = require('../config/env');

fs.mkdirSync(env.uploadDir, { recursive: true });

function sanitizeSegment(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'misc';
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const folder = sanitizeSegment(req.body.folder || req.query.folder || 'general');
    const targetDir = path.join(env.uploadDir, folder);
    fs.mkdirSync(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const baseName = sanitizeSegment(path.basename(file.originalname || 'file', ext));
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${baseName}${ext}`);
  }
});

const upload = multer({ storage });

function getPublicUploadPath(absoluteFilePath) {
  const relativePath = path.relative(env.uploadDir, absoluteFilePath).split(path.sep).join('/');
  return `${env.publicUploadBase}/${relativePath}`;
}

function resolveUploadFile(publicPathname) {
  const normalized = String(publicPathname || '').replace(env.publicUploadBase, '').replace(/^\/+/, '');
  return path.join(env.uploadDir, normalized);
}

module.exports = {
  upload,
  sanitizeSegment,
  getPublicUploadPath,
  resolveUploadFile
};
