# Showly VDS Kurulum Rehberi

## 1) Sunucu paketleri

```bash
sudo apt update
sudo apt install -y nginx postgresql postgresql-contrib
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 2) Projeyi sunucuya koy

```bash
sudo mkdir -p /var/www/showly
sudo chown -R $USER:$USER /var/www/showly
cd /var/www/showly
git clone <repo-url> .
npm install
npm run test:smoke
```

## 3) Upload klasoru

```bash
sudo mkdir -p /var/www/uploads
sudo chown -R $USER:$USER /var/www/uploads
```

## 4) PostgreSQL veritabani

```bash
sudo -u postgres psql
CREATE USER showly WITH PASSWORD 'strong-password';
CREATE DATABASE showly OWNER showly;
\q
psql "postgresql://showly:strong-password@127.0.0.1:5432/showly" -f sql/schema.sql
```

## 5) Ortam degiskenleri

`.env` olustur:

```env
PORT=3000
NODE_ENV=production
DATABASE_URL=postgresql://showly:strong-password@127.0.0.1:5432/showly
JWT_SECRET=very-long-random-secret
UPLOAD_DIR=/var/www/uploads
PUBLIC_UPLOAD_BASE=/uploads
CORS_ORIGIN=https://your-domain.com
```

## 6) Ilk admin kullanicisi

```bash
npm run create-admin -- --username admin --password ChangeMe123!
```

## 6.1) Hizli smoke test

Bu komut API, login, store/product CRUD, siparis ve upload akislarini yerel test veritabani ile dogrular:

```bash
npm run test:smoke
```

## 7) PM2 ile ayaga kaldir

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 8) NGINX reverse proxy

```bash
sudo cp deploy/nginx-showly.conf /etc/nginx/sites-available/showly
sudo ln -s /etc/nginx/sites-available/showly /etc/nginx/sites-enabled/showly
sudo nginx -t
sudo systemctl restart nginx
```

## 9) Opsiyonel HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

## REST API ornekleri

### Admin login

```bash
curl -X POST https://your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"ChangeMe123!"}'
```

### Magazalari listele

```bash
curl https://your-domain.com/api/stores
```

### Urunleri storeId ile cek

```bash
curl "https://your-domain.com/api/products?filters=%5B%7B%22field%22%3A%22storeId%22%2C%22value%22%3A%22STORE_ID%22%7D%5D"
```

### Siparis olustur

```bash
curl -X POST https://your-domain.com/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "storeId":"STORE_ID",
    "storeName":"Store Name",
    "customer":{"name":"Ali","phone":"+99361234567","address":"Ashgabat","note":"Doorbell"},
    "items":[{"id":"PRODUCT_ID","title":"Item","price":"120 TMT","quantity":2}],
    "total":"240 TMT",
    "status":"pending"
  }'
```

## Frontend fetch ornekleri

```js
const stores = await fetch('/api/stores').then((res) => res.json());

const loginPayload = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'ChangeMe123!' })
}).then((res) => res.json());

const orderResult = await fetch('/api/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    storeId: 'STORE_ID',
    storeName: 'Store Name',
    customer: { name: 'Ali', phone: '+99361234567', address: 'Ashgabat' },
    items: [{ id: 'PRODUCT_ID', title: 'Product', price: '99 TMT', quantity: 1 }],
    total: '99 TMT'
  })
}).then((res) => res.json());
```
