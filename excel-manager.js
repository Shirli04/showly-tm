/**
 * ExcelManager - Excel dosyasını sunucuya gönderir, sunucu parse eder.
 * Tarayıcıda XLSX kütüphanesi gerekmez.
 */
class ExcelManager {
    static async importProductsFromExcel(file) {
        const loadingOverlay = document.getElementById('loading-overlay');
        const loadingText = document.querySelector('.loading-text');

        if (loadingOverlay) loadingOverlay.style.display = 'flex';
        if (loadingText) loadingText.textContent = 'Excel dosyası yükleniyor...';

        try {
            const token = sessionStorage.getItem('adminToken') || localStorage.getItem('adminToken') || '';
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/products/import-excel', {
                method: 'POST',
                headers: token ? { 'Authorization': `Bearer ${token}` } : {},
                body: formData
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Sunucu hatası');
            }

            if (loadingOverlay) loadingOverlay.style.display = 'none';

            let msg = `✅ ${result.successCount} ürün başarıyla yüklendi.`;
            if (result.errorCount > 0) {
                msg += `\n❌ ${result.errorCount} hata oluştu.`;
                if (result.errors && result.errors.length > 0) {
                    alert(msg + '\n\nİlk hatalar:\n' + result.errors.join('\n'));
                    return { success: true, count: result.successCount };
                }
            }
            alert(msg);
            return { success: true, count: result.successCount };

        } catch (error) {
            if (loadingOverlay) loadingOverlay.style.display = 'none';
            throw error;
        }
    }
}
