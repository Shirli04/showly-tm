// Local upload bridge.
(function () {
    'use strict';

    function getToken() {
        try {
            return sessionStorage.getItem('adminToken') || localStorage.getItem('adminToken') || '';
        } catch (error) {
            return '';
        }
    }

    function sanitizeFolder(name) {
        return String(name || 'general')
            .toLowerCase()
            .replace(/[çÇ]/g, 'c')
            .replace(/[ğĞ]/g, 'g')
            .replace(/[ıİ]/g, 'i')
            .replace(/[öÖ]/g, 'o')
            .replace(/[şŞ]/g, 's')
            .replace(/[üÜ]/g, 'u')
            .replace(/[^a-z0-9._-]+/g, '-')
            .replace(/^-+|-+$/g, '') || 'general';
    }

    async function uploadToR2(file, storeName) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', sanitizeFolder(storeName));

        const headers = {};
        const token = getToken();
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch('/api/uploads', {
            method: 'POST',
            headers,
            body: formData
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || 'Upload failed');
        }

        const payload = await response.json();
        return payload.url;
    }

    async function deleteFromR2(imageUrl) {
        const headers = { 'Content-Type': 'application/json' };
        const token = getToken();
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch('/api/uploads', {
            method: 'DELETE',
            headers,
            body: JSON.stringify({ filePath: imageUrl })
        });

        return response.ok;
    }

    window.uploadToR2 = uploadToR2;
    window.deleteFromR2 = deleteFromR2;
})();
