/**
 * ExcelManager - Ürünlerin Excel'den içe aktarılmasını yöneten sınıf.
 * G:\Showly konumundaki mantık temel alınarak VDS/PostgreSQL yapısına uyarlanmıştır.
 */
class ExcelManager {
    /**
     * Ürünleri Excel dosyasından okur ve veritabanına kaydeder.
     * @param {File} file - Yüklenecek Excel dosyası
     */
    static async importProductsFromExcel(file) {
        const loadingOverlay = document.getElementById('loading-overlay');
        const loadingText = document.querySelector('.loading-text');

        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        if (loadingText) loadingText.textContent = 'Excel dosyası okunuyor...';

        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = async (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);

                    console.log('📊 Excel verisi okundu:', jsonData.length, 'satır');
                    if (loadingText) loadingText.textContent = 'Mağazalar listesi alınıyor...';

                    // Mevcut mağazaları çek (eşleştirme için)
                    const stores = await window.showlyDB.getStores();
                    
                    let successCount = 0;
                    let errorCount = 0;
                    const errors = [];
                    const preparedProducts = [];

                    for (let i = 0; i < jsonData.length; i++) {
                        const row = jsonData[i];

                        try {
                            // Mağaza adını temizle ve bul
                            const storeName = String(row['Magazyn Ady'] || row['Mağaza Adı'] || row['Magaza Adi'] || '').trim();

                            if (!storeName) {
                                errorCount++;
                                errors.push(`Satır ${i + 2}: Mağaza adı boş`);
                                continue;
                            }

                            // Mağazayı bul (büyük/küçük harf duyarsız, slug veya ID destekli)
                            const searchName = storeName.toLowerCase();
                            const store = stores.find(s => {
                                const sName = String(s.name || '').toLowerCase();
                                const sSlug = String(s.slug || '').toLowerCase();
                                const sId = String(s.id || '').toLowerCase();
                                
                                return sName === searchName || 
                                       sSlug === searchName || 
                                       sId === searchName ||
                                       sName.replace(/[^a-z0-9]/g, '') === searchName.replace(/[^a-z0-9]/g, '');
                            });

                            if (!store) {
                                errorCount++;
                                errors.push(`Satır ${i + 2}: "${storeName}" mağazası bulunamadı`);
                                continue;
                            }

                            // Ürün adını al (TM zorunlu)
                            const title = String(row['Haryt Ady (TM)'] || row['Haryt Ady'] || row['Ürün Adı'] || '').trim();
                            if (!title) {
                                errorCount++;
                                errors.push(`Satır ${i + 2}: Ürün adı (TM) boş`);
                                continue;
                            }

                            // Fiyat işleme
                            let normalPriceValue = String(row['Baha'] || row['Normal Fiyat'] || '0').trim().replace('TMT', '').replace(' ', '');
                            let price = `${normalPriceValue} TMT`;

                            // İndirimli fiyat işleme
                            let discountedPriceValue = String(row['Arzanladyş Bahasy'] || row['İndirimli Fiyat'] || '').trim().replace('TMT', '').replace(' ', '');
                            let originalPrice = '';
                            let isOnSale = false;

                            if (discountedPriceValue && !isNaN(discountedPriceValue) && parseFloat(discountedPriceValue) > 0) {
                                originalPrice = `${discountedPriceValue} TMT`;
                                isOnSale = true;
                            }

                            // Ürün verisi objesini oluştur
                            const productData = {
                                storeId: store.id,
                                title: title,
                                description: String(row['Düşündiriş (TM)'] || row['Düşündiriş'] || row['Açıklama'] || '').trim(),
                                // Çok dilli isimler
                                name_ru: String(row['Haryt Ady (RU)'] || '').trim(),
                                name_en: String(row['Haryt Ady (EN)'] || '').trim(),
                                // Çok dilli açıklamalar
                                desc_ru: String(row['Düşündiriş (RU)'] || '').trim(),
                                desc_en: String(row['Düşündiriş (EN)'] || '').trim(),
                                // Fiyatlar
                                price: price,
                                originalPrice: originalPrice,
                                isOnSale: isOnSale,
                                // Kategoriler
                                category: String(row['Kategoriýa (TM)'] || row['Kategoriýa'] || row['Kategori'] || '').trim(),
                                category_ru: String(row['Kategoriýa (RU)'] || '').trim(),
                                category_en: String(row['Kategoriýa (EN)'] || '').trim(),
                                // Diğer alanlar
                                material: String(row['Material'] || row['Malzeme'] || '').trim(),
                                imageUrl: String(row['Surat URL'] || row['Resim URL'] || '').trim(),
                            };

                            const productId = row['Haryt ID'] || row['Product ID'];
                            preparedProducts.push({ index: i, id: productId, data: productData });

                        } catch (err) {
                            errorCount++;
                            errors.push(`Satır ${i + 2}: ${err.message}`);
                        }
                    }

                    // Batch Write Modu (300+ ürün için optimizasyon)
                    const useBatch = preparedProducts.length > 50; // VDS sisteminde 50+ ürün için batch kullanmak daha güvenli

                    if (useBatch) {
                        const BATCH_SIZE = 100;
                        const totalBatches = Math.ceil(preparedProducts.length / BATCH_SIZE);

                        for (let b = 0; b < totalBatches; b++) {
                            const start = b * BATCH_SIZE;
                            const end = Math.min(start + BATCH_SIZE, preparedProducts.length);
                            const chunk = preparedProducts.slice(start, end);

                            if (loadingText) loadingText.textContent = `Yükleniyor: ${start + 1}-${end} / ${preparedProducts.length}`;

                            const batch = window.db.batch();
                            chunk.forEach(item => {
                                const docRef = window.db.collection('products').doc(item.id);
                                if (item.id) {
                                    batch.update(docRef, item.data);
                                } else {
                                    batch.set(docRef, item.data);
                                }
                            });

                            try {
                                await batch.commit();
                                successCount += chunk.length;
                            } catch (batchErr) {
                                console.error('Batch hatası, tekli denemeye geçiliyor:', batchErr);
                                for (const item of chunk) {
                                    try {
                                        const docRef = window.db.collection('products').doc(item.id);
                                        if (item.id) {
                                            await docRef.update(item.data);
                                        } else {
                                            await window.db.collection('products').add(item.data);
                                        }
                                        successCount++;
                                    } catch (singleErr) {
                                        errorCount++;
                                        errors.push(`Satır ${item.index + 2}: ${singleErr.message}`);
                                    }
                                }
                            }
                        }
                    } else {
                        // Tekli Mod
                        for (let i = 0; i < preparedProducts.length; i++) {
                            const item = preparedProducts[i];
                            if (loadingText) loadingText.textContent = `Ürün yükleniyor... (${i + 1}/${preparedProducts.length})`;

                            try {
                                const docRef = window.db.collection('products').doc(item.id);
                                if (item.id) {
                                    await docRef.update(item.data);
                                } else {
                                    await window.db.collection('products').add(item.data);
                                }
                                successCount++;
                            } catch (err) {
                                errorCount++;
                                errors.push(`Satır ${item.index + 2}: ${err.message}`);
                            }
                        }
                    }

                    if (loadingText) loadingText.textContent = 'İşlem tamamlandı!';
                    
                    setTimeout(() => {
                        if (loadingOverlay) loadingOverlay.style.display = 'none';
                        
                        let msg = `✅ ${successCount} ürün başarıyla işlendi.`;
                        if (errorCount > 0) {
                            msg += `\n❌ ${errorCount} hata oluştu.`;
                            console.error('İçe aktarma hataları:', errors);
                            if (errors.length > 0) {
                                alert(msg + '\n\nİlk hatalar:\n' + errors.slice(0, 5).join('\n'));
                            }
                        } else {
                            alert(msg);
                        }
                        resolve({ success: true, count: successCount });
                    }, 500);

                } catch (error) {
                    if (loadingOverlay) loadingOverlay.style.display = 'none';
                    console.error('Excel okuma hatası:', error);
                    reject(error);
                }
            };

            reader.onerror = () => {
                if (loadingOverlay) loadingOverlay.style.display = 'none';
                reject(new Error('Dosya okunamadı'));
            };

            reader.readAsArrayBuffer(file);
        });
    }
}
