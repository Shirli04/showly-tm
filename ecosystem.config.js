module.exports = {
  apps: [
    {
      name: 'showly',
      script: 'server/src/server.js',
      cwd: '/var/www/showly',

      // ✅ Cluster mode: tüm CPU çekirdeklerini kullan
      // "max" → CPU sayısı kadar instance. Tek çekirdekli sunucuda 1 olur.
      instances: 'max',
      exec_mode: 'cluster',

      // ✅ Hatalı restart koruması
      max_restarts: 10,             // 10 kez içinde restart başarısızsa dur
      min_uptime: '20s',            // 20 saniye altında crash → "başarısız" say
      restart_delay: 4000,          // Restart arası 4 saniye bekle
      autorestart: true,

      // ✅ Bellek sınırı (RAM şişerse restart)
      max_memory_restart: '500M',

      // ✅ Loglar — pm2-logrotate ile gün/sayı sınırı yönetilir
      out_file: '/var/log/showly/out.log',
      error_file: '/var/log/showly/error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // ✅ Graceful shutdown
      kill_timeout: 5000,
      wait_ready: false,
      listen_timeout: 10000,

      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};

// ─── Sunucu kurulum talimatları (sadece ilk kez) ─────────────────────────────
// 1) Log klasörü:
//    sudo mkdir -p /var/log/showly
//    sudo chown -R $USER:$USER /var/log/showly
//
// 2) Cluster mode başlat:
//    pm2 delete showly         # eski tek instance'ı kaldır (varsa)
//    pm2 start ecosystem.config.js
//    pm2 save                  # boot ile başlasın
//    pm2 startup               # ilk kurulumda
//
// 3) Log rotation (pm2-logrotate modülü):
//    pm2 install pm2-logrotate
//    pm2 set pm2-logrotate:max_size 50M
//    pm2 set pm2-logrotate:retain 14
//    pm2 set pm2-logrotate:compress true
//    pm2 set pm2-logrotate:rotateInterval '0 0 * * *'  # her gece
//
// 4) Durum kontrolü:
//    pm2 status
//    pm2 logs showly --lines 100
//    pm2 monit
