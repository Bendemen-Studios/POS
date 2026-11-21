import crypto from 'crypto';
import db from '../../../lib/db';

export const config = { api: { bodyParser: { sizeLimit: '256kb' } } };

async function ensureTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS pos_core_commands (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      command_id VARCHAR(128) NOT NULL UNIQUE,
      action VARCHAR(64) NOT NULL,
      payload JSON NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      result JSON DEFAULT NULL,
      last_error VARCHAR(500) DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      claimed_at TIMESTAMP NULL,
      completed_at TIMESTAMP NULL,
      INDEX idx_status_created (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function authorized(req) {
  const secret = process.env.BDMPOS_CORE_SECRET || '';
  const supplied = String(req.headers['x-bdm-pos-secret'] || '');
  return secret.length >= 32 && supplied.length === secret.length &&
    crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(supplied));
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    await ensureTable();
    const action = String(req.query.action || '');
    if (req.method === 'POST' && action === 'enqueue') {
      const commandId = String(req.body?.command_id || '').slice(0, 128);
      const commandAction = String(req.body?.action || '');
      const payload = req.body?.payload;
      if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(commandId) ||
          !['order.create', 'order.complete', 'stock.set'].includes(commandAction) ||
          !payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return res.status(400).json({ success: false, error: 'Invalid command' });
      }
      await db.query(
        "INSERT IGNORE INTO pos_core_commands (command_id, action, payload) VALUES (?, ?, ?)",
        [commandId, commandAction, JSON.stringify(payload)]
      );
      const [rows] = await db.query('SELECT command_id, status FROM pos_core_commands WHERE command_id = ? LIMIT 1', [commandId]);
      return res.status(202).json({ success: true, command: rows[0] });
    }
    if (req.method === 'GET' && action === 'pull') {
      const [rows] = await db.query(
        "SELECT id, command_id, action, payload FROM pos_core_commands WHERE status = 'pending' ORDER BY id ASC LIMIT 5"
      );
      for (const row of rows) {
        await db.query(
          "UPDATE pos_core_commands SET status = 'processing', attempts = attempts + 1, claimed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'",
          [row.id]
        );
      }
      return res.status(200).json({ success: true, commands: rows });
    }
    if (req.method === 'POST' && action === 'ack') {
      const commandId = String(req.body?.command_id || '').slice(0, 128);
      const success = req.body?.success === true;
      const result = req.body?.result ?? null;
      const error = String(req.body?.error || '').slice(0, 500);
      if (!commandId) return res.status(400).json({ success: false, error: 'command_id required' });
      const [rows] = await db.query('SELECT status FROM pos_core_commands WHERE command_id = ? LIMIT 1', [commandId]);
      if (!rows.length) return res.status(404).json({ success: false, error: 'Command not found' });
      await db.query(
        'UPDATE pos_core_commands SET status = ?, result = ?, last_error = ?, completed_at = CURRENT_TIMESTAMP WHERE command_id = ?',
        [success ? 'complete' : 'failed', JSON.stringify(result), error || null, commandId]
      );
      return res.status(200).json({ success: true });
    }
    if (req.method === 'GET' && action === 'status') {
      const commandId = String(req.query.command_id || '').slice(0, 128);
      const [rows] = await db.query(
        'SELECT command_id, action, status, result, last_error, created_at, completed_at FROM pos_core_commands WHERE command_id = ? LIMIT 1',
        [commandId]
      );
      return rows.length ? res.status(200).json({ success: true, command: rows[0] }) : res.status(404).json({ success: false, error: 'Command not found' });
    }
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).json({ success: false, error: 'Unsupported method or action' });
  } catch (error) {
    console.error('[BDM POS COMMAND QUEUE]', error.message);
    return res.status(503).json({ success: false, error: 'Command queue unavailable' });
  }
}