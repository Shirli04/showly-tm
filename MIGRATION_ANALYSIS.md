# Mevcut Yapi Analizi

## Firebase kullanim alanlari

- `firebase-config.js` eski yapida Firestore baglantisi, `window.db`, `window.showlyDB`, CRUD yardimcilari ve `addStoreToFirebase` / `addProductToFirebase` fonksiyonlarini sagliyordu.
- `login.html` kullanici girisini `users` koleksiyonu uzerinden yapiyor, sifreyi client-side karsilastiriyordu.
- `script.js` vitrin tarafinda `stores`, `products`, `orders`, `parentCategories`, `subcategories`, `categories`, `settings`, `reservationPackages` koleksiyonlarini okuyup/yaziyordu.
- `admin.js` admin panelinde `stores`, `products`, `orders`, `users`, `parentCategories`, `subcategories`, `settings`, `reservationPackages` uzerinde tam CRUD yapiyordu.
- `excel-manager.js` Excel import/export islemlerinde `stores` ve `products` koleksiyonlarini kullanıyordu.

## Cloudflare R2 kullanim alanlari

- `r2-config.js` urun gorselleri ve restoran/bron sema gorselleri icin upload/delete katmani sagliyordu.
- `admin.js` urun gorsellerini ve bron semalarini `uploadToR2()` ile yukluyordu.

## Eski veri akisi

### Public vitrin

1. `index.html` -> `script.js`
2. `script.js` -> Firestore `stores`, `parentCategories`, `subcategories`, `categories`
3. Store sayfasinda -> Firestore `products`
4. Siparis verince -> Firestore `orders`
5. Rezervasyon verince -> Firestore `reservationPackages` oku + `orders` yaz
6. Bron verince -> Firestore `stores` oku + `orders` oku/yaz

### Admin panel

1. `login.html` -> Firestore `users`
2. `admin.html` -> `admin.js`
3. Admin panel -> Firestore `stores`, `products`, `orders`, `users`, `parentCategories`, `subcategories`, `reservationPackages`, `settings`
4. Gorsel yukleme -> Cloudflare R2 Worker

## Inferred veri modeli

- `users`: username, password/hash, role, permissions, createdAt
- `stores`: name, slug, description, category, social links, phone, location, orderPhone, hasReservation, hasBron, restaurantSchemaUrl, tables, featured/readyMeal ayarlari, views
- `products`: storeId, title, name_ru, name_en, description, desc_ru, desc_en, material, category, category_ru, category_en, price, originalPrice, isOnSale, imageUrl, variants
- `orders`: orderType, storeId, storeName, customer, items, total/totalPrice, status, orderNumber, eventType, guestCount, tableNumber, date/timestamp
- `parentCategories`: name, name_ru, name_en, icon, order
- `subcategories`: parentId, name, name_ru, name_en, order
- `reservationPackages`: storeId, totalPrice, serviceTypes, serviceFeatures, menuItems, capacities
- `settings/general`: hideCategories vb.

## Yeni hedef mapleme

- Firestore -> Express REST API + PostgreSQL tablolari (`sql/schema.sql`)
- Cloudflare R2 -> local disk upload (`/var/www/uploads`) + `/api/uploads`
- Firebase Auth -> JWT login (`/api/auth/login`)
- Frontend eski Firestore cagri stilini kaybetmeden local API bridge ile calisiyor (`firebase-config.js`)
