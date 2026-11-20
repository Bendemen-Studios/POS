import crypto from 'crypto';
import db from '../../../lib/db';

export const config = {
  api: { bodyParser: false, sizeLimit: '64kb' }
};

const ALLOWED_RESOURCE_TYPES = new Set(['product', 'variation', 'stock', 'order', 'customer', 'category']);

async function readRawBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error('Webhook payload is too large');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function ensureWebhookTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS pos_core_webhook_events (
      event_id VARCHAR(128) NOT NULL PRIMARY KEY,
      event_name VARCHAR(100) NOT NULL,
      resource_type VARCHAR(32) NOT NULL,
      resource_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
      payload JSON NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'received',
      received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMP NULL,
      INDEX idx_resource (resource_type, resource_id),
      INDEX idx_received (received_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

function invalidateCatalogCache() {
  const caches = globalThis.__bdmPosProductsCaches;
  if (!(caches instanceof Map)) return;
  for (const cache of caches.values()) {
    if (!cache) continue;
    cache.data = null;
    cache.updatedAt = 0;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const secret = process.env.BDMPOS_CORE_WEBHOOK_SECRET;
  if (!secret || secret.length < 32) {
    return res.status(503).json({ success: false, error: 'Core webhook authentication is not configured' });
  }

  let rawBody;
  try {
    rawBody = await readRawBody(req);
  } catch (error) {
    return res.status(413).json({ success: false, error: error.message });
  }

  const suppliedSignature = String(req.headers['x-bdm-pos-signature'] || '');
  const expectedSignature = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  if (!safeEqual(suppliedSignature, expectedSignature)) {
    return res.status(401).json({ success: false, error: 'Invalid webhook signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (_) {
    return res.status(400).json({ success: false, error: 'Invalid JSON payload' });
  }

  const eventId = String(event?.event_id || req.headers['x-bdm-pos-event'] || '').slice(0, 128);
  const eventName = String(event?.event_name || '').slice(0, 100);
  const resourceType = String(event?.resource_type || '');
  const resourceId = Number(event?.resource_id || 0);
  if (!eventId || !eventName || !ALLOWED_RESOURCE_TYPES.has(resourceType) || !Number.isSafeInteger(resourceId) || resourceId < 0) {
    return res.status(400).json({ success: false, error: 'Invalid webhook event fields' });
  }

  try {
    await ensureWebhookTable();
    await db.query(
      `INSERT IGNORE INTO pos_core_webhook_events
       (event_id, event_name, resource_type, resource_id, payload, status)
       VALUES (?, ?, ?, ?, ?, 'received')`,
      [eventId, eventName, resourceType, resourceId, JSON.stringify(event)]
    );

    // These side effects are deliberately safe to repeat. If a process stopped
    // after recording the event but before invalidating the cache, WooCommerce's
    // retry still repairs the cache state.
    if (['product', 'variation', 'stock', 'category'].includes(resourceType)) {
      invalidateCatalogCache();
    }

    await db.query(
      `UPDATE pos_core_webhook_events
       SET status = 'processed', processed_at = CURRENT_TIMESTAMP
       WHERE event_id = ?`,
      [eventId]
    );

    return res.status(200).json({ success: true, received: true, duplicate_safe: true });
  } catch (error) {
    console.error('[BDM POS CORE WEBHOOK]', error.message);
    return res.status(503).json({ success: false, error: 'Webhook could not be processed' });
  }
}
