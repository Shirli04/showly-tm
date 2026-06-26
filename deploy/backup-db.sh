#!/usr/bin/env bash
# Showly PostgreSQL günlük yedekleme scripti
# Kullanım:
#   1. Sunucuda /var/www/showly/deploy/backup-db.sh olarak koy
#   2. chmod +x backup-db.sh
#   3. cron'a ekle (bkz. crontab örneği aşağıda)
#
# Crontab örneği (her gece 03:30):
#   30 3 * * * /var/www/showly/deploy/backup-db.sh >> /var/log/showly-backup.log 2>&1

set -euo pipefail

# ─── Ayarlar ────────────────────────────────────────────────────────────────
# .env'den oku, fallback değer ver
if [ -f /var/www/showly/.env ]; then
  set -a
  # shellcheck disable=SC1091
  source /var/www/showly/.env
  set +a
fi

DB_URL="${DATABASE_URL:-postgresql://showly:strong-password@127.0.0.1:5432/showly}"
BACKUP_DIR="${BACKUP_DIR:-/var/www/showly-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"   # 14 gün sakla

# ─── Hazırlık ───────────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
OUT_FILE="$BACKUP_DIR/showly_${TIMESTAMP}.sql.gz"

# ─── Yedek al ───────────────────────────────────────────────────────────────
echo "[$(date)] Backup başlıyor: $OUT_FILE"
pg_dump --no-owner --no-acl --clean --if-exists "$DB_URL" | gzip -9 > "$OUT_FILE"
SIZE=$(du -h "$OUT_FILE" | cut -f1)
echo "[$(date)] Backup tamam: $SIZE"

# ─── Eski yedekleri temizle ─────────────────────────────────────────────────
find "$BACKUP_DIR" -name 'showly_*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -delete
REMAINING=$(find "$BACKUP_DIR" -name 'showly_*.sql.gz' -type f | wc -l)
echo "[$(date)] Toplam yedek: $REMAINING (en eski: $RETENTION_DAYS gün)"

# ─── (Opsiyonel) Uzak yedek — Cloudflare R2 / S3 / başka sunucu ──────────────
# Yorum işaretini kaldır + kendi bilgilerinle değiştir:
#
# rclone copy "$OUT_FILE" r2:showly-backups/  --quiet
# veya:
# aws s3 cp "$OUT_FILE" s3://my-bucket/showly-backups/ --quiet
# veya başka bir sunucuya scp:
# scp "$OUT_FILE" backup-user@another-host:/backups/showly/

echo "[$(date)] Bitti."
