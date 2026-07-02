// ============================================================
// language.js – Showly Çok Dilli Destek Modülü
// Desteklenen diller: tm (Türkmen), ru (Rusça), en (İngilizce), tr (Türkçe)
// ============================================================

(function () {
    'use strict';

    // --- AYARLAR ---
    const LANG_STORAGE_KEY = 'showly_language';
    const DEFAULT_LANG = 'tm';
    const SUPPORTED_LANGS = ['tm', 'ru', 'en', 'tr'];

    // --- ÇEVİRİ TABLOSU ---
    const TRANSLATIONS = {
        // Header & Search
        search_placeholder: {
            tm: 'Gözle...',
            ru: 'Поиск...',
            en: 'Search...',
            tr: 'Ara...'
        },

        // Hero Section
        hero_title: {
            tm: 'Ähli görnüşli satyjylar üçin online kataloglar',
            ru: 'Онлайн-каталоги для продавцов всех видов',
            en: 'Online catalogs for all types of sellers',
            tr: 'Her tür satıcı için online kataloglar'
        },
        hero_subtitle: {
            tm: 'Bir sahypada ähli önümleriniz – müşderiler üçin taýýar görnüşde.',
            ru: 'Все ваши товары на одной странице — в готовом виде для клиентов.',
            en: 'All your products on one page — ready for customers.',
            tr: 'Tüm ürünleriniz tek bir sayfada — müşterileriniz için hazır.'
        },

        // Info Section
        about_title: {
            tm: 'Biz barada',
            ru: 'О нас',
            en: 'About Us',
            tr: 'Hakkımızda'
        },
        about_text_1: {
            tm: 'Şowly – Türkmenistanda döredilen onlaýn katalog platformasy.',
            ru: 'Şowly — онлайн-платформа каталогов, созданная в Туркменистане.',
            en: 'Showly — an online catalog platform created in Turkmenistan.',
            tr: 'Showly — Türkmenistan\'da kurulan online katalog platformudur.'
        },
        about_text_2: {
            tm: 'Biz satyjylaryň önümlerini müşderilere ýakynlaşdyrýarys.',
            ru: 'Мы приближаем товары продавцов к покупателям.',
            en: 'We bring sellers\' products closer to customers.',
            tr: 'Satıcıların ürünlerini müşterilere yaklaştırıyoruz.'
        },
        about_text_3: {
            tm: 'Maksadymyz – her bir satyjynyň online çykmagyny ýeňilleşdirmek.',
            ru: 'Наша цель — облегчить выход каждого продавца в онлайн.',
            en: 'Our goal — to make it easy for every seller to go online.',
            tr: 'Amacımız — her satıcının online\'a çıkmasını kolaylaştırmak.'
        },
        why_title: {
            tm: 'Näme üçin Şowly ?',
            ru: 'Почему Şowly?',
            en: 'Why Showly?',
            tr: 'Neden Showly?'
        },
        feature_easy: {
            tm: 'Ýönekeý ulanyş',
            ru: 'Простое использование',
            en: 'Easy to use',
            tr: 'Kolay kullanım'
        },
        feature_fast: {
            tm: 'Çalt wagtda satyjy bolmak hyzmaty',
            ru: 'Быстрая услуга стать продавцом',
            en: 'Quick seller registration service',
            tr: 'Hızlı satıcı olma hizmeti'
        },

        // Product Cards & Lists
        add_to_cart: {
            tm: 'Sebede goş',
            ru: 'В корзину',
            en: 'Add to Cart',
            tr: 'Sepete ekle'
        },
        discount: {
            tm: 'Arzanladyş',
            ru: 'Скидка',
            en: 'Sale',
            tr: 'İndirim'
        },
        popular_title: {
            tm: 'Köp sargyt edilýän',
            ru: 'Часто заказывают',
            en: 'Most ordered',
            tr: 'Çok sipariş edilen'
        },
        popular_eyebrow: {
            tm: 'Meşhur',
            ru: 'Популярное',
            en: 'Popular',
            tr: 'Popüler'
        },
        upsell_title: {
            tm: 'Maslahat berýäris',
            ru: 'Рекомендуем',
            en: 'We recommend',
            tr: 'Tavsiye ederiz'
        },

        // Cart Modal
        cart_title: {
            tm: 'Sebedim',
            ru: 'Корзина',
            en: 'My Cart',
            tr: 'Sepetim'
        },
        cart_empty: {
            tm: 'Siz öz sargyt etjek harytlaryňyzy şu sebede goşup bilersiňiz.',
            ru: 'Вы можете добавить товары для заказа в эту корзину.',
            en: 'You can add products to your cart for ordering.',
            tr: 'Sipariş vermek istediğiniz ürünleri bu sepete ekleyebilirsiniz.'
        },
        cart_total: {
            tm: 'Umumy',
            ru: 'Итого',
            en: 'Total',
            tr: 'Toplam'
        },
        order_btn: {
            tm: 'Sargyt et',
            ru: 'Заказать',
            en: 'Order',
            tr: 'Sipariş ver'
        },
        delivery_notice: {
            tm: 'Aşgabada we başga 5 welaýata sargyt edip berýäris.',
            ru: 'Доставляем заказы в Ашхабад и 5 велаятов.',
            en: 'We deliver orders to Ashgabat and 5 regions.',
            tr: 'Aşkabat ve diğer 5 vilayete sipariş teslim ediyoruz.'
        },

        // Favorites Modal
        favorites_title: {
            tm: 'Halanlarym',
            ru: 'Избранное',
            en: 'Favorites',
            tr: 'Favorilerim'
        },
        favorites_empty: {
            tm: 'Siz harytlardan öz halanyňyzy saýlap bilersiňiz.',
            ru: 'Вы можете выбрать понравившиеся товары.',
            en: 'You can select your favorite products.',
            tr: 'Beğendiğiniz ürünleri seçebilirsiniz.'
        },

        // Product Modal
        material_label: {
            tm: 'Material:',
            ru: 'Материал:',
            en: 'Material:',
            tr: 'Malzeme:'
        },

        // Search Results
        search_results: {
            tm: 'Gözleg',
            ru: 'Поиск',
            en: 'Search',
            tr: 'Arama'
        },
        search_count: {
            tm: 'harydy',
            ru: 'товаров',
            en: 'products',
            tr: 'ürün'
        },
        no_results: {
            tm: 'Haryt tapylmady',
            ru: 'Товар не найден',
            en: 'No products found',
            tr: 'Ürün bulunamadı'
        },
        search_empty_warning: {
            tm: 'Gözleýän harydyňyzyň adyny ýazyň!',
            ru: 'Введите название товара!',
            en: 'Enter a product name!',
            tr: 'Aradığınız ürünün adını yazın!'
        },

        // Filters
        filter_btn: {
            tm: 'Filtr',
            ru: 'Фильтр',
            en: 'Filter',
            tr: 'Filtre'
        },
        filter_all: {
            tm: 'Ähli harytlar',
            ru: 'Все товары',
            en: 'All Products',
            tr: 'Tüm ürünler'
        },
        filter_discount: {
            tm: 'Arzanladyş',
            ru: 'Со скидкой',
            en: 'On Sale',
            tr: 'İndirimde'
        },
        filter_price_asc: {
            tm: 'Arzandan gymmada',
            ru: 'От дешёвых к дорогим',
            en: 'Price: Low to High',
            tr: 'Ucuzdan pahalıya'
        },
        filter_price_desc: {
            tm: 'Gymmatdan arzana',
            ru: 'От дорогих к дешёвым',
            en: 'Price: High to Low',
            tr: 'Pahalıdan ucuza'
        },
        filter_quick: {
            tm: 'Hızlı Filtreler',
            ru: 'Быстрые фильтры',
            en: 'Quick Filters',
            tr: 'Hızlı Filtreler'
        },
        filter_price_range: {
            tm: 'Baha aralygy',
            ru: 'Ценовой диапазон',
            en: 'Price Range',
            tr: 'Fiyat aralığı'
        },
        filter_no_product: {
            tm: 'Bu filtrde haryt tapylmady.',
            ru: 'По этому фильтру товаров не найдено.',
            en: 'No products found for this filter.',
            tr: 'Bu filtrede ürün bulunamadı.'
        },
        filter_min_tmt: {
            tm: 'Min TMT',
            ru: 'Мин. TMT',
            en: 'Min TMT',
            tr: 'Min TMT'
        },
        filter_max_tmt: {
            tm: 'Max TMT',
            ru: 'Макс. TMT',
            en: 'Max TMT',
            tr: 'Maks TMT'
        },

        // Loading
        loading: {
            tm: 'Biraz garaşyň...',
            ru: 'Подождите...',
            en: 'Please wait...',
            tr: 'Lütfen bekleyin...'
        },
        // --- BANKET & FAVORİLER ---
        banquet_loading_packages: {
            tm: 'Paketler ýüklenýär...',
            ru: 'Загрузка пакетов...',
            en: 'Loading packages...',
            tr: 'Paketler yükleniyor...'
        },
        banquet_no_packages: {
            tm: 'Bu restoran üçin heniz paket goşulmady.',
            ru: 'Для этого ресторана пакетов пока нет.',
            en: 'No packages added for this restaurant yet.',
            tr: 'Bu restoran için henüz paket eklenmedi.'
        },
        banquet_load_error: {
            tm: 'Paketler ýüklenip bilmedi.',
            ru: 'Не удалось загрузить пакеты.',
            en: 'Failed to load packages.',
            tr: 'Paketler yüklenemedi.'
        },
        banquet_no_capacity: {
            tm: 'Kapasite maglumaty ýok.',
            ru: 'Нет информации о вместимости.',
            en: 'No capacity information.',
            tr: 'Kapasite bilgisi yok.'
        },
        banquet_fill_all: {
            tm: 'Lütfen ähli meýdançalary dolduryň!',
            ru: 'Пожалуйста, заполните все поля!',
            en: 'Please fill in all fields!',
            tr: 'Lütfen tüm alanları doldurun!'
        },
        banquet_submitting: {
            tm: 'Iberilýär...',
            ru: 'Отправка...',
            en: 'Sending...',
            tr: 'Gönderiliyor...'
        },
        banquet_success: {
            tm: '✅ Sargyt kabul edildi! Siziň bilen basym habarlaşarys.',
            ru: '✅ Заказ принят! Мы скоро свяжемся с вами.',
            en: '✅ Order received! We will contact you soon.',
            tr: '✅ Sipariş alındı! Sizinle yakında iletişime geçeceğiz.'
        },
        banquet_error: {
            tm: 'Sargyt ýerleşdirilmedi. Lütfen gaýtadan synanyşyň.',
            ru: 'Заказ не размещен. Пожалуйста, попробуйте еще раз.',
            en: 'Order not placed. Please try again.',
            tr: 'Sipariş oluşturulamadı. Lütfen tekrar deneyin.'
        },
        fav_added: {
            tm: 'Halanlaryma goşuldy',
            ru: 'Добавлено в избранное',
            en: 'Added to favorites',
            tr: 'Favorilere eklendi'
        },
        fav_removed: {
            tm: 'Halanlarymdan aýryldy',
            ru: 'Удалено из избранного',
            en: 'Removed from favorites',
            tr: 'Favorilerden kaldırıldı'
        },

        // 404 Page
        not_found_title: {
            tm: 'Sahypa Tapylmady',
            ru: 'Страница не найдена',
            en: 'Page Not Found',
            tr: 'Sayfa Bulunamadı'
        },
        not_found_message: {
            tm: 'Gözleýän magazynyňyz tapylmady',
            ru: 'Магазин, который вы ищете, не найден',
            en: 'The store you are looking for was not found',
            tr: 'Aradığınız mağaza bulunamadı'
        },
        back_home: {
            tm: 'Esasy sahypa git',
            ru: 'На главную',
            en: 'Go to Home',
            tr: 'Ana sayfaya dön'
        },
        reload_page: {
            tm: 'Sahypany täzele',
            ru: 'Обновить страницу',
            en: 'Reload Page',
            tr: 'Sayfayı yenile'
        },

        // Notifications
        added_to_cart: {
            tm: 'sebede goşuldy!',
            ru: 'добавлен в корзину!',
            en: 'added to cart!',
            tr: 'sepete eklendi!'
        },
        removed_from_favorites: {
            tm: 'Halanlarymdan aýryldy',
            ru: 'Удалено из избранного',
            en: 'Removed from favorites',
            tr: 'Favorilerden kaldırıldı'
        },
        added_to_favorites: {
            tm: 'Halanlaryma goşuldy',
            ru: 'Добавлено в избранное',
            en: 'Added to favorites',
            tr: 'Favorilere eklendi'
        },
        cart_is_empty: {
            tm: 'Sebediňiz boş!',
            ru: 'Корзина пуста!',
            en: 'Your cart is empty!',
            tr: 'Sepetiniz boş!'
        },

        // Order Form
        order_form_name: {
            tm: 'Adyňyz Familiýaňyz',
            ru: 'Имя и Фамилия',
            en: 'Full Name',
            tr: 'Ad Soyad'
        },
        order_form_name_placeholder: {
            tm: 'Adyňyzy we Familiýaňyzy ýazyň',
            ru: 'Введите имя и фамилию',
            en: 'Enter your full name',
            tr: 'Ad ve soyadınızı girin'
        },
        order_form_phone: {
            tm: 'Telefon nomeriňiz',
            ru: 'Ваш номер телефона',
            en: 'Your phone number',
            tr: 'Telefon numaranız'
        },
        order_form_address: {
            tm: 'Adresiňiz',
            ru: 'Ваш адрес',
            en: 'Your address',
            tr: 'Adresiniz'
        },
        order_form_address_placeholder: {
            tm: 'Adresiňizi ýazyň',
            ru: 'Введите ваш адрес',
            en: 'Enter your address',
            tr: 'Adresinizi girin'
        },
        order_form_note: {
            tm: 'Bellik (Opsiýonel)',
            ru: 'Примечание (необязательно)',
            en: 'Note (Optional)',
            tr: 'Not (İsteğe bağlı)'
        },
        order_form_note_placeholder: {
            tm: 'Bellik',
            ru: 'Примечание',
            en: 'Note',
            tr: 'Not'
        },
        order_form_cancel: {
            tm: 'Aýyr',
            ru: 'Отмена',
            en: 'Cancel',
            tr: 'İptal'
        },
        order_form_submit: {
            tm: 'Sargyt ediň',
            ru: 'Оформить заказ',
            en: 'Place Order',
            tr: 'Sipariş oluştur'
        },
        order_items_label: {
            tm: 'Harytlar:',
            ru: 'Товары:',
            en: 'Products:',
            tr: 'Ürünler:'
        },
        order_processing: {
            tm: 'Sargydyňyz işlenýär...',
            ru: 'Ваш заказ обрабатывается...',
            en: 'Your order is being processed...',
            tr: 'Siparişiniz işleniyor...'
        },
        order_fill_all: {
            tm: 'Ähli meýdançalary dolduryň!',
            ru: 'Заполните все поля!',
            en: 'Fill in all fields!',
            tr: 'Tüm alanları doldurun!'
        },
        order_phone_invalid: {
            tm: 'Telefon nomeriňizi dogry giriziň (+993 6XXXXXXX)!',
            ru: 'Введите правильный номер телефона (+993 6XXXXXXX)!',
            en: 'Enter a valid phone number (+993 6XXXXXXX)!',
            tr: 'Geçerli bir telefon numarası girin (+993 6XXXXXXX)!'
        },

        // Banquet
        banquet_btn: {
            tm: 'Banket',
            ru: 'Банкет',
            en: 'Banquet',
            tr: 'Ziyafet'
        },
        bron_btn: {
            tm: 'Bron',
            ru: 'Бронирование',
            en: 'Booking',
            tr: 'Rezervasyon'
        },
        bron_modal_title: {
            tm: 'Stol Bronlamak',
            ru: 'Бронирование стола',
            en: 'Table Booking',
            tr: 'Masa Rezervasyonu'
        },
        bron_title: {
            tm: 'Masa Bronlamak',
            ru: 'Бронирование стола',
            en: 'Table Booking',
            tr: 'Masa Rezervasyonu'
        },
        bron_select_table: {
            tm: 'Stol saýlaň...',
            ru: 'Выберите стол...',
            en: 'Select table...',
            tr: 'Masa seçin...'
        },
        bron_schema_desc: {
            tm: 'Restoran şemasy',
            ru: 'Схема ресторана',
            en: 'Restaurant schema',
            tr: 'Restoran şeması'
        },
        bron_table_no: {
            tm: 'Stol saýlaň',
            ru: 'Выберите стол',
            en: 'Select table',
            tr: 'Masa seçin'
        },
        bron_time_title: {
            tm: 'Wagt we Sene',
            ru: 'Время и Дата',
            en: 'Time and Date',
            tr: 'Zaman ve Tarih'
        },
        bron_date: {
            tm: 'Sene',
            ru: 'Дата',
            en: 'Date',
            tr: 'Tarih'
        },
        bron_time: {
            tm: 'Sagat',
            ru: 'Час',
            en: 'Time',
            tr: 'Saat'
        },
        bron_submit_btn: {
            tm: 'Bron et',
            ru: 'Забронировать',
            en: 'Book now',
            tr: 'Rezervasyon yap'
        },
        bron_already_booked: {
            tm: 'Gynansakda, bu masa eýýäm saýlanan wagtda bronlanan. Başga wagt ýa-da masa saýlap görüň.',
            ru: 'К сожалению, этот стол уже забронирован на выбранное время. Пожалуйста, выберите другое время или стол.',
            en: 'Unfortunately, this table is already booked for the selected time. Please choose another time or table.',
            tr: 'Maalesef bu masa seçilen zaman için zaten rezerve edilmiş. Lütfen başka bir zaman veya masa seçin.'
        }
    };

    // --- CALLBACK SİSTEMİ ---
    const _langChangeCallbacks = [];

    // --- FONKSİYONLAR ---

    /** Aktif dili localStorage'dan oku */
    function getSelectedLang() {
        const lang = localStorage.getItem(LANG_STORAGE_KEY);
        return (lang && SUPPORTED_LANGS.includes(lang)) ? lang : DEFAULT_LANG;
    }

    /** Dili localStorage'a yaz ve callback'leri çalıştır */
    function setSelectedLang(lang) {
        if (!SUPPORTED_LANGS.includes(lang)) return;
        localStorage.setItem(LANG_STORAGE_KEY, lang);

        document.querySelectorAll('.lang-option').forEach(opt => {
            opt.classList.toggle('active', opt.getAttribute('data-lang') === lang);
        });

        // Dropdown'ı kapat
        const selector = document.getElementById('language-selector');
        if (selector) selector.classList.remove('open');

        // Callback'leri çalıştır
        _langChangeCallbacks.forEach(cb => {
            try { cb(lang); } catch (e) { console.error('Lang change callback error:', e); }
        });
    }

    /** Verilen anahtarın çevirisini döndür */
    function translate(key, lang) {
        lang = lang || getSelectedLang();
        const entry = TRANSLATIONS[key];
        if (!entry) return '';
        return entry[lang] || entry[DEFAULT_LANG] || '';
    }

    /** Sayfadaki tüm [data-i18n] ve [data-i18n-placeholder] elementlerine çeviri uygula */
    function applyTranslations() {
        const lang = getSelectedLang();

        // 1) textContent çevirisi: data-i18n
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const val = translate(key, lang);
            if (val) el.textContent = val;
        });

        // 2) placeholder çevirisi: data-i18n-placeholder
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            const val = translate(key, lang);
            if (val) el.placeholder = val;
        });
    }

    /**
     * Ürün alanını dile göre döndür (fallback mantığı ile)
     * @param {Object} product - Ürün objesi
     * @param {string} field - Alan tipi: 'name' veya 'desc'
     * @param {string} lang - Dil kodu: 'tm', 'ru', 'en'
     * @returns {string}
     */
    function getProductField(product, field, lang) {
        lang = lang || getSelectedLang();

        // Veritabanındaki gerçek alan adları
        const FIELD_MAP = {
            name: { tm: 'title', ru: 'name_ru', en: 'name_en', tr: 'name_tr' },
            desc: { tm: 'description', ru: 'desc_ru', en: 'desc_en', tr: 'desc_tr' },
            category: { tm: 'category', ru: 'category_ru', en: 'category_en', tr: 'category_tr' },
            material: { tm: 'material', ru: 'material_ru', en: 'material_en', tr: 'material_tr' }
        };

        const config = FIELD_MAP[field];
        if (!config) return product[field] || '';

        // İstenen dildeki veriyi bul, yoksa TM (varsayılan) verisini döndür
        const targetField = config[lang];
        const fallbackField = config[DEFAULT_LANG];

        const targetVal = product[targetField];
        const fallbackVal = product[fallbackField];

        // String'e çevir ve kontrol et
        if (targetVal && String(targetVal).trim() !== '') {
            return String(targetVal);
        }
        return fallbackVal ? String(fallbackVal) : '';
    }

    /**
     * Kategori adını dile göre döndür
     * @param {Object} cat - Kategori objesi (name, name_ru, name_en, name_tr)
     * @param {string} lang - Dil kodu
     * @returns {string}
     */
    function getCategoryName(cat, lang) {
        lang = lang || getSelectedLang();
        if (lang === 'tm') return String(cat.name || '');
        const val = cat['name_' + lang];
        return val ? String(val) : (cat.name ? String(cat.name) : '');
    }

    /** Dil değiştiğinde çağrılacak callback kaydet */
    function onLanguageChange(callback) {
        if (typeof callback === 'function') {
            _langChangeCallbacks.push(callback);
        }
    }

    // --- BAŞLATMA ---
    document.addEventListener('DOMContentLoaded', () => {
        const lang = getSelectedLang();
        const LANG_LABELS = { tm: 'TM', ru: 'RU', en: 'EN', tr: 'TR' };

        // Aktif seçeneği işaretle
        document.querySelectorAll('.lang-option').forEach(opt => {
            opt.classList.toggle('active', opt.getAttribute('data-lang') === lang);
        });

        // Toggle aç/kapat
        const toggle = document.getElementById('lang-toggle');
        const selector = document.getElementById('language-selector');
        if (toggle && selector) {
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                selector.classList.toggle('open');
            });
        }

        // Seçenek tıklaması
        document.querySelectorAll('.lang-option').forEach(opt => {
            opt.addEventListener('click', () => {
                setSelectedLang(opt.getAttribute('data-lang'));
            });
        });

        // Dışına tıklayınca kapat
        document.addEventListener('click', (e) => {
            if (selector && !selector.contains(e.target)) {
                selector.classList.remove('open');
            }
        });

        // İlk yüklemede çevirileri uygula
        applyTranslations();
    });

    // --- GLOBAL ERİŞİM ---
    window.getSelectedLang = getSelectedLang;
    window.setSelectedLang = setSelectedLang;
    window.translate = translate;
    window.applyTranslations = applyTranslations;
    window.getProductField = getProductField;
    window.getCategoryName = getCategoryName;
    window.onLanguageChange = onLanguageChange;
    window.SHOWLY_TRANSLATIONS = TRANSLATIONS;

})();
