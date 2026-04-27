const fs = require('fs');
const admin = require('firebase-admin');
const env = require('../config/env');
const { listFcmTokensByStoreId } = require('./repository');

let initialized = false;

function tryInitialize() {
  if (initialized) return true;

  try {
    if (admin.apps.length) {
      initialized = true;
      return true;
    }

    let credentialPayload = null;

    if (env.firebaseServiceAccountJson) {
      credentialPayload = JSON.parse(env.firebaseServiceAccountJson);
    } else if (env.firebaseServiceAccountPath && fs.existsSync(env.firebaseServiceAccountPath)) {
      credentialPayload = JSON.parse(fs.readFileSync(env.firebaseServiceAccountPath, 'utf8'));
    }

    if (!credentialPayload) {
      console.warn('[FCM] Service account is not configured. Notifications are disabled.');
      return false;
    }

    admin.initializeApp({
      credential: admin.credential.cert(credentialPayload)
    });

    initialized = true;
    return true;
  } catch (error) {
    console.error('[FCM] Initialization failed:', error.message);
    return false;
  }
}

async function sendNewOrderNotification(order) {
  if (!order || !order.storeId) return { sent: 0, skipped: true };
  if (!tryInitialize()) return { sent: 0, skipped: true };

  const tokens = await listFcmTokensByStoreId(order.storeId);
  if (!tokens.length) {
    return { sent: 0, skipped: true };
  }

  const body = `${order.customer?.name || 'Musteri'} - ${order.total || ''}`.trim();

  const payload = {
    tokens,
    notification: {
      title: 'Yeni Siparis',
      body: body || 'Yeni siparis geldi'
    },
    data: {
      type: 'NEW_ORDER',
      orderId: String(order.id || ''),
      storeId: String(order.storeId || ''),
      status: String(order.status || 'pending')
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'order_notifications'
      }
    }
  };

  const result = await admin.messaging().sendEachForMulticast(payload);
  if (result.failureCount > 0) {
    result.responses.forEach((response, index) => {
      if (!response.success) {
        console.warn('[FCM] Send failed for token:', tokens[index], response.error?.message);
      }
    });
  }

  return { sent: result.successCount, failed: result.failureCount };
}

module.exports = {
  sendNewOrderNotification
};
