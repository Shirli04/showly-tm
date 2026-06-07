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

const ALLOWED_IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif'
]);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

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

function imageFileFilter(req, file, cb) {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  if (!ALLOWED_IMAGE_EXTS.has(ext)) {
    return cb(new Error('Only image files are allowed (jpg, jpeg, png, webp, gif)'));
  }
  if (!ALLOWED_IMAGE_MIMES.has(mime)) {
    return cb(new Error('Invalid image content type'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: imageFileFilter
});

function getPublicUploadPath(absoluteFilePath) {
  const relativePath = path.relative(env.uploadDir, absoluteFilePath).split(path.sep).join('/');
  return `${env.publicUploadBase}/${relativePath}`;
}

function resolveUploadFile(publicPathname) {
  const raw = String(publicPathname || '').replace(env.publicUploadBase, '').replace(/^\/+/, '');
  // path.normalize+resolve ile gerçek hedef yolunu hesapla
  const candidate = path.resolve(env.uploadDir, raw);
  const allowedRoot = path.resolve(env.uploadDir);
  // Güvenlik: hedef yol uploadDir içinde olmalı (path traversal koruması)
  if (candidate !== allowedRoot && !candidate.startsWith(allowedRoot + path.sep)) {
    throw new Error('Invalid upload path');
  }
  return candidate;
}

module.exports = {
  upload,
  sanitizeSegment,
  getPublicUploadPath,
  resolveUploadFile
};
