function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function deepReplaceFieldValueMarkers(value) {
  if (Array.isArray(value)) {
    return value.map(deepReplaceFieldValueMarkers);
  }

  if (isObject(value)) {
    if (value.__showlyServerTimestamp) {
      return new Date().toISOString();
    }

    if (typeof value.__showlyIncrement === 'number') {
      return { __increment: value.__showlyIncrement };
    }

    const next = {};
    Object.keys(value).forEach((key) => {
      next[key] = deepReplaceFieldValueMarkers(value[key]);
    });
    return next;
  }

  return value;
}

function parseMoney(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  const cleaned = String(value).replace(/[^0-9.,-]/g, '').replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMoney(value) {
  if (value == null || value === '') return '';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return `${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)} TMT`;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

module.exports = {
  deepReplaceFieldValueMarkers,
  parseMoney,
  formatMoney,
  ensureArray,
  isObject
};
