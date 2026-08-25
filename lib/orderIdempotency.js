import pool from './db';

let tableReadyPromise = null;

export async function ensureOrderIdempotencyTable() {
  if (!tableReadyPromise) {
    tableReadyPromise = pool.query(`
      CREATE TABLE IF NOT EXISTS pos_order_idempotency (
        client_order_id VARCHAR(128) PRIMARY KEY,
        status VARCHAR(32) NOT NULL DEFAULT 'processing',
        woo_order_id VARCHAR(64) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_status_updated (status, updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `).catch((error) => {
      tableReadyPromise = null;
      throw error;
    });
  }

  await tableReadyPromise;
}

export async function claimOrder(clientOrderId) {
  await ensureOrderIdempotencyTable();

  const id = String(clientOrderId).slice(0, 128);
  const [result] = await pool.query(
    `INSERT IGNORE INTO pos_order_idempotency (client_order_id, status)
     VALUES (?, 'processing')`,
    [id]
  );

  const [rows] = await pool.query(
    `SELECT client_order_id, status, woo_order_id, updated_at
     FROM pos_order_idempotency
     WHERE client_order_id = ?
     LIMIT 1`,
    [id]
  );

  const row = rows[0];
  if (!row) throw new Error('Idempotency record kon niet worden aangemaakt.');

  // Een gecrashte poging mag na 10 minuten opnieuw worden uitgevoerd.
  const stale = row.status === 'processing' &&
    Date.now() - new Date(row.updated_at).getTime() > 10 * 60 * 1000;

  if (row.status === 'processing' && result.affectedRows === 0 && !stale) {
    return { claimed: false, processing: true, completed: false, wooOrderId: null };
  }

  if (row.status === 'completed' && row.woo_order_id) {
    return { claimed: false, processing: false, completed: true, wooOrderId: row.woo_order_id };
  }

  if (stale) {
    await pool.query(
      `UPDATE pos_order_idempotency
       SET status = 'processing', woo_order_id = NULL
       WHERE client_order_id = ?`,
      [id]
    );
  }

  return { claimed: true, processing: false, completed: false, wooOrderId: null };
}

export async function completeOrder(clientOrderId, wooOrderId) {
  await ensureOrderIdempotencyTable();
  await pool.query(
    `UPDATE pos_order_idempotency
     SET status = 'completed', woo_order_id = ?
     WHERE client_order_id = ?`,
    [String(wooOrderId), String(clientOrderId).slice(0, 128)]
  );
}

export async function releaseOrder(clientOrderId) {
  await ensureOrderIdempotencyTable();
  await pool.query(
    `DELETE FROM pos_order_idempotency
     WHERE client_order_id = ? AND status = 'processing'`,
    [String(clientOrderId).slice(0, 128)]
  );
}