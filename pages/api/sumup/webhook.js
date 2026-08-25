import pool from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST vereist' });

  try {
    const event = req.body || {};
    const payload = event.payload || {};
    const clientTransactionId = payload.client_transaction_id || payload.clientTransactionId || null;
    const status = String(payload.status || '').toUpperCase();

    // Webhooks zijn aanvullend op de transactiestatus-polling in de POS.
    // Bewaar alleen een klein auditspoor; nooit kaartgegevens.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sumup_webhook_events (
        event_id VARCHAR(128) PRIMARY KEY,
        event_type VARCHAR(128) NULL,
        client_transaction_id VARCHAR(255) NULL,
        status VARCHAR(32) NULL,
        received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sumup_client_tx (client_transaction_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const eventId = String(event.id || `sumup-${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 128);
    await pool.query(
      `INSERT IGNORE INTO sumup_webhook_events
       (event_id, event_type, client_transaction_id, status)
       VALUES (?, ?, ?, ?)`,
      [eventId, event.event_type || null, clientTransactionId, status || null]
    );

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[SUMUP WEBHOOK ERROR]', error);
    // SumUp moet bij een tijdelijke DB-fout kunnen retryen.
    return res.status(500).json({ received: false });
  }
}
