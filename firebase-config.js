// Local API compatibility layer replacing Firebase/Firestore.
(function () {
    'use strict';

    function generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // Fallback for HTTP (non-secure) contexts
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    const API_MAP = {
        stores: '/api/stores',
        products: '/api/products',
        orders: '/api/orders',
        users: '/api/users',
        parentCategories: '/api/categories/parents',
        subcategories: '/api/categories/subcategories',
        reservationPackages: '/api/reservation-packages',
        settings: '/api/settings',
        categories: '/api/categories/legacy'
    };

    const SERVER_TIMESTAMP_MARKER = { __showlyServerTimestamp: true };

    function cloneValue(value) {
        if (Array.isArray(value)) return value.map(cloneValue);
        if (value && typeof value === 'object') {
            const next = {};
            Object.keys(value).forEach((key) => {
                next[key] = cloneValue(value[key]);
            });
            return next;
        }
        return value;
    }

    function getToken() {
        try {
            return sessionStorage.getItem('adminToken') || localStorage.getItem('adminToken') || '';
        } catch (error) {
            return '';
        }
    }

    async function apiRequest(url, options) {
        const headers = new Headers(options && options.headers ? options.headers : {});
        if (!headers.has('Content-Type') && !(options && options.body instanceof FormData)) {
            headers.set('Content-Type', 'application/json');
        }

        const token = getToken();
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        const response = await fetch(url, {
            ...options,
            headers
        });

        if (response.status === 204) {
            return null;
        }

        let payload = null;
        try {
            payload = await response.json();
        } catch (error) {
            payload = null;
        }

        if (!response.ok) {
            const message = payload && payload.message ? payload.message : `Request failed: ${response.status}`;
            const error = new Error(message);
            error.code = response.status;
            error.response = payload;
            throw error;
        }

        return payload;
    }

    function makeDocSnapshot(ref, raw) {
        return {
            id: raw ? raw.id : ref.id,
            exists: Boolean(raw),
            ref,
            data() {
                if (!raw) return undefined;
                const data = { ...raw };
                delete data.id;
                return data;
            }
        };
    }

    function makeQuerySnapshot(docs) {
        return {
            docs,
            empty: docs.length === 0,
            size: docs.length,
            forEach(callback) {
                docs.forEach(callback);
            }
        };
    }

    function buildEndpoint(collectionName, id) {
        const base = API_MAP[collectionName];
        if (!base) {
            throw new Error(`Unknown collection: ${collectionName}`);
        }

        if (collectionName === 'settings' && id) {
            return `${base}/${encodeURIComponent(id)}`;
        }

        return id ? `${base}/${encodeURIComponent(id)}` : base;
    }

    class DocumentReference {
        constructor(collectionName, id) {
            this.collectionName = collectionName;
            this.id = id;
        }

        async get() {
            try {
                const data = await apiRequest(buildEndpoint(this.collectionName, this.id), { method: 'GET' });
                return makeDocSnapshot(this, data);
            } catch (error) {
                if (Number(error.code) === 404) {
                    return makeDocSnapshot(this, null);
                }
                throw error;
            }
        }

        async set(data) {
            const payload = cloneValue(data);
            const response = await apiRequest(buildEndpoint(this.collectionName, this.id), {
                method: 'PUT',
                body: JSON.stringify(payload)
            });
            return makeDocSnapshot(this, response);
        }

        async update(data) {
            const payload = cloneValue(data);
            const response = await apiRequest(buildEndpoint(this.collectionName, this.id), {
                method: 'PATCH',
                body: JSON.stringify(payload)
            });
            return makeDocSnapshot(this, response);
        }

        async delete() {
            await apiRequest(buildEndpoint(this.collectionName, this.id), { method: 'DELETE' });
        }
    }

    class Query {
        constructor(collectionName) {
            this.collectionName = collectionName;
            this.filters = [];
            this.order = null;
        }

        where(field, operator, value) {
            if (operator !== '==') {
                throw new Error('Only == operator is supported in local compatibility layer');
            }
            this.filters.push({ field, value });
            return this;
        }

        orderBy(field, direction) {
            this.order = { field, direction: direction || 'asc' };
            return this;
        }

        doc(id) {
            return new DocumentReference(this.collectionName, id || generateUUID());
        }

        async add(data) {
            const payload = cloneValue(data);
            const response = await apiRequest(buildEndpoint(this.collectionName), {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            return { id: response.id };
        }

        async get() {
            const params = new URLSearchParams();
            if (this.filters.length > 0) {
                params.set('filters', JSON.stringify(this.filters));
            }
            if (this.order) {
                params.set('orderBy', this.order.field);
                params.set('orderDir', this.order.direction || 'asc');
            }

            const endpoint = buildEndpoint(this.collectionName);
            const url = params.toString() ? `${endpoint}?${params.toString()}` : endpoint;
            const rows = await apiRequest(url, { method: 'GET' });
            const docs = (rows || []).map((row) => {
                const ref = new DocumentReference(this.collectionName, row.id);
                return makeDocSnapshot(ref, row);
            });
            return makeQuerySnapshot(docs);
        }
    }

    class WriteBatch {
        constructor() {
            this.operations = [];
        }

        set(docRef, data) {
            this.operations.push({ type: 'set', collection: docRef.collectionName, id: docRef.id, data: cloneValue(data) });
            return this;
        }

        update(docRef, data) {
            this.operations.push({ type: 'update', collection: docRef.collectionName, id: docRef.id, data: cloneValue(data) });
            return this;
        }

        delete(docRef) {
            this.operations.push({ type: 'delete', collection: docRef.collectionName, id: docRef.id });
            return this;
        }

        async commit() {
            await apiRequest('/api/batch', {
                method: 'POST',
                body: JSON.stringify({ operations: this.operations })
            });
        }
    }

    const db = {
        collection(name) {
            return new Query(name);
        },
        batch() {
            return new WriteBatch();
        },
        settings() {
            return null;
        },
        enablePersistence() {
            return Promise.resolve();
        }
    };

    window.showlyDB = {
        async getStores() {
            return apiRequest('/api/stores', { method: 'GET' });
        },
        async getProducts(storeId) {
            if (!storeId) {
                return apiRequest('/api/products', { method: 'GET' });
            }
            const params = new URLSearchParams({ filters: JSON.stringify([{ field: 'storeId', value: storeId }]) });
            return apiRequest(`/api/products?${params.toString()}`, { method: 'GET' });
        },
        async addOrder(order) {
            return apiRequest('/api/orders', {
                method: 'POST',
                body: JSON.stringify(order)
            });
        },
        async deleteStore(storeId) {
            return apiRequest(`/api/stores/${encodeURIComponent(storeId)}`, { method: 'DELETE' });
        },
        async deleteProduct(productId) {
            return apiRequest(`/api/products/${encodeURIComponent(productId)}`, { method: 'DELETE' });
        }
    };

    window.firebase = {
        firestore: {
            CACHE_SIZE_UNLIMITED: Number.MAX_SAFE_INTEGER,
            FieldValue: {
                serverTimestamp() {
                    return cloneValue(SERVER_TIMESTAMP_MARKER);
                },
                increment(value) {
                    return { __showlyIncrement: Number(value) || 0 };
                }
            }
        }
    };

    window.db = db;
})();
