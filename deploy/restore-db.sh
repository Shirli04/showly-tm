#!/usr/bin/env bash
# Showly PostgreSQL geri yükleme scripti (felaket senaryosu)
# Kullanım:
#   sudo bash restore-db.sh /var/www/showly-backups/showly_2026-06-06_033000.sql.gz

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Kullanım: $0 <backup-dosyasi.sql.gz>"
  echo "Mevcut yedekler:"
  ls -lh /var/www/showly-backups/showly_*.sql.gz 2>/dev/null || echo "  (yedek yok)"
  exit 1
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "HATA: Dosya bulunamadı: $BACKUP_FILE"
  exit 1
fi

# .env yükle
if [ -f /var/www/showly/.env ]; then
  set -a
  # shellcheck disable=SC1091
  source /var/www/showly/.env
  set +a
fi
DB_URL="${DATABASE_URL:-postgresql://showly:strong-password@127.0.0.1:5432/showly}"

echo "⚠️  DİKKAT: Şu an SİL+YENİDEN OLUŞTUR yapılacak: $DB_URL"
echo "    Yedek: $BACKUP_FILE"
read -rp "Devam et? (yes/N): " ans
if [ "$ans" != "yes" ]; then
  echo "İptal edildi."
  exit 0
fi

# Uygulamayı durdur ki restore sırasında çakışma olmasın
pm2 stop showly 2>/dev/null || true

echo "[$(date)] Restore başlıyor..."
gunzip -c "$BACKUP_FILE" | psql "$DB_URL"
echo "[$(date)] Restore tamam."

# Uygulamayı tekrar başlat
pm2 start showly 2>/dev/null || true

echo "[$(date)] Bitti. pm2 status ile kontrol et."
