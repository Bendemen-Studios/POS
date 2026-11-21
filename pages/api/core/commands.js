import crypto from 'crypto';
import db from '../../../lib/db';

export const config = { api: { bodyParser: { sizeLimit: '8mb' } } };

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
      INDEX idx_status_created (status, created_at),
      INDEX idx_status_claimed (status, claimed_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

function authorized(req) {
  const secret = process.env.BDMPOS_CORE_SECRET || '';
  const supplied = String(req.headers['x-bdm-pos-secret'] || '');
  return secret.length >= 32 && supplied.length === secret.length &&
    crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(supplied));
}

async function claimCommands() {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    // Recover crashed workers after a two-minute lease. Limit retries.
    await connection.query(`
      UPDATE pos_core_commands
      SET status = IF(attempts >= 5, 'failed', 'pending'),
          last_error = IF(attempts >= 5, 'Worker lease expired after maximum attempts', last_error),
          claimed_at = NULL
      WHERE status = 'processing' AND claimed_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 MINUTE)
    `);
    const [rows] = await connection.query(
      "SELECT id, command_id, action, payload FROM pos_core_commands WHERE status = 'pending' AND attempts < 5 ORDER BY id ASC LIMIT 5 FOR UPDATE"
    );
    if (rows.length) {
      const ids = rows.map(row => row.id);
      await connection.query(
        "UPDATE pos_core_commands SET status = 'processing', attempts = attempts + 1, claimed_at = UTC_TIMESTAMP() WHERE id IN (?) AND status = 'pending'",
        [ids]
      );
    }
    await connection.commit();
    return rows;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const action = String(req.query.action || '');

  // A probe only validates the shared secret and endpoint availability.
  // Keep it ahead of ensureTable() so diagnostics never run DDL or touch queue data.
  if (req.method === 'GET' && action === 'probe') {
    return res.status(200).json({ success: true, authenticated: true, endpoint: 'reachable', destructive: false });
  }

  try {
    await ensureTable();
    if (req.method === 'POST' && action === 'enqueue') {
      const commandId = String(req.body?.command_id || '').slice(0, 128);
      const commandAction = String(req.body?.action || '');
      const payload = req.body?.payload;
      if (!/^[a-zA-Z0-9._:-]{8,128}$/.test(commandId) ||
          !['order.complete', 'stock.set', 'core.request'].includes(commandAction) ||
          !payload || typeof payload !== 'object' || Array.isArray(payload) ||
          (commandAction === 'core.request' && (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(String(payload.method || 'GET').toUpperCase()) || !String(payload.route || '').startsWith('/bdmpos/v1/') || String(payload.route || '').includes('..')))) {
        return res.status(400).json({ success: false, error: 'Invalid command. Order creation is intentionally disabled until checkout migration is separately tested.' });
      }
      await db.query(
        "INSERT IGNORE INTO pos_core_commands (command_id, action, payload) VALUES (?, ?, ?)",
        [commandId, commandAction, JSON.stringify(payload)]
      );
      const [rows] = await db.query('SELECT command_id, status FROM pos_core_commands WHERE command_id = ? LIMIT 1', [commandId]);
      return res.status(202).json({ success: true, command: rows[0] });
    }
    if (req.method === 'GET' && action === 'pull') {
      const commands = await claimCommands();
      return res.status(200).json({ success: true, commands });
    }
    if (req.method === 'POST' && action === 'ack') {
      const commandId = String(req.body?.command_id || '').slice(0, 128);
      const success = req.body?.success === true;
      const result = req.body?.result ?? null;
      const error = String(req.body?.error || '').slice(0, 500);
      if (!commandId) return res.status(400).json({ success: false, error: 'command_id required' });
      const [update] = await db.query(
        "UPDATE pos_core_commands SET status = ?, result = ?, last_error = ?, completed_at = UTC_TIMESTAMP() WHERE command_id = ? AND status = 'processing'",
        [success ? 'complete' : 'failed', JSON.stringify(result), error || null, commandId]
      );
      if (!update.affectedRows) return res.status(409).json({ success: false, error: 'Command is not currently processing' });
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