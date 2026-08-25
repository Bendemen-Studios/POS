import db from '../../../lib/db';

const SUMUP_API = 'https://api.sumup.com';

function getConfig() {
  const apiKey = process.env.SUMUP_API_KEY;
  const merchantCode = process.env.SUMUP_MERCHANT_CODE;
  const appId = process.env.SUMUP_APP_ID;
  const affiliateKey = process.env.SUMUP_AFFILIATE_KEY;
  if (!apiKey || !merchantCode) throw new Error('SUMUP_API_KEY en SUMUP_MERCHANT_CODE ontbreken in .env');
  return { apiKey, merchantCode, appId, affiliateKey };
}

async function sumup(path, options = {}) {
  const { apiKey } = getConfig();
  const response = await fetch(`${SUMUP_API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(data?.message || data?.error || `SumUp HTTP ${response.status}`);
  return data;
}

async function getTransaction(merchantCode, clientTransactionId) {
  return sumup(`/v2.1/merchants/${encodeURIComponent(merchantCode)}/transactions?client_transaction_id=${encodeURIComponent(clientTransactionId)}`, { method: 'GET' });
}

async function waitForTransaction(merchantCode, clientTransactionId, timeoutMs = 120000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const result = await getTransaction(merchantCode, clientTransactionId);
      const tx = result?.data || result;
      const status = String(tx?.status || tx?.simple_status || '').toUpperCase();
      if (status === 'SUCCESSFUL') return tx;
      if (['FAILED', 'CANCELLED', 'REFUNDED', 'CHARGE_BACK'].includes(status)) {
        throw new Error(`SumUp betaling ${status.toLowerCase()}.`);
      }
    } catch (error) {
      if (/betaling (failed|cancelled|refunded|charge_back)/i.test(error.message)) throw error;
      // De transactie bestaat soms pas enkele seconden na het starten.
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('SumUp betaling wacht nog op bevestiging. Controleer de Solo voordat je opnieuw probeert te betalen.');
}

const webhookUrl = () => process.env.SUMUP_WEBHOOK_URL || `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.bendemen.com'}/api/sumup/webhook`;

export default async function handler(req, res) {
  const { action, readerId, checkoutId, transactionId } = req.query;
  try {
    const { merchantCode, appId, affiliateKey } = getConfig();

    if (action === 'readers') {
      const data = await sumup(`/v0.1/merchants/${encodeURIComponent(merchantCode)}/readers`, { method: 'GET' });
      return res.status(200).json({ success: true, readers: data.items || [] });
    }

    if (action === 'reader-status' && readerId) {
      const data = await sumup(`/v0.1/merchants/${encodeURIComponent(merchantCode)}/readers/${encodeURIComponent(readerId)}/status`, { method: 'GET' });
      return res.status(200).json({ success: true, status: data });
    }

    if (action === 'pair') {
      const { pairingCode, name, metadata = {} } = req.body || {};
      if (!pairingCode || !name) return res.status(400).json({ success: false, error: 'pairingCode en name zijn verplicht' });
      const data = await sumup(`/v0.1/merchants/${encodeURIComponent(merchantCode)}/readers`, { method: 'POST', body: JSON.stringify({ pairing_code: String(pairingCode).trim(), name, metadata }) });
      return res.status(200).json({ success: true, reader: data });
    }

    if (action === 'unlink' && readerId) {
      await sumup(`/v0.1/merchants/${encodeURIComponent(merchantCode)}/readers/${encodeURIComponent(readerId)}`, { method: 'DELETE' });
      try { await db.query('UPDATE stores SET terminal_id = NULL WHERE terminal_id = ?', [readerId]); } catch (dbErr) { console.error(dbErr); }
      return res.status(200).json({ success: true });
    }

    if (action === 'assign-store') {
      const { storeId, readerId: targetReaderId } = req.body || {};
      if (!storeId || !targetReaderId) return res.status(400).json({ success: false, error: 'storeId en readerId zijn verplicht' });
      await db.query('UPDATE stores SET terminal_id = ? WHERE id = ?', [targetReaderId, storeId]);
      return res.status(200).json({ success: true });
    }

    if (action === 'pay') {
      const { totalAmount, storeId, foreignTransactionId, description, readerId: bodyReaderId } = req.body || {};
      const amount = Number(totalAmount);
      if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ success: false, error: 'Ongeldig bedrag' });

      let targetReaderId = bodyReaderId;
      if (!targetReaderId && storeId) {
        try {
          const [rows] = await db.query('SELECT terminal_id FROM stores WHERE id = ? LIMIT 1', [storeId]);
          targetReaderId = rows?.[0]?.terminal_id || null;
        } catch (dbErr) { console.error('Reader lookup failed:', dbErr); }
      }
      if (!targetReaderId) return res.status(400).json({ success: false, error: 'Geen SumUp Solo gekoppeld aan dit filiaal.' });

      const foreignId = String(foreignTransactionId || `bdm-${Date.now()}-${crypto.randomUUID()}`);
      const affiliate = appId && affiliateKey ? { app_id: appId, key: affiliateKey, foreign_transaction_id: foreignId } : undefined;
      const payload = {
        total_amount: { currency: 'EUR', minor_unit: 2, value: Math.round(amount * 100) },
        description: description || 'Bendemen POS betaling',
        return_url: webhookUrl(),
        ...(affiliate ? { affiliate } : {}),
      };

      const checkout = await sumup(`/v0.1/merchants/${encodeURIComponent(merchantCode)}/readers/${encodeURIComponent(targetReaderId)}/checkout`, { method: 'POST', body: JSON.stringify(payload) });
      const clientTransactionId = checkout?.data?.client_transaction_id;
      if (!clientTransactionId) throw new Error('SumUp gaf geen client_transaction_id terug.');

      // Wacht server-side op het definitieve betaalresultaat. Daardoor maakt de POS
      // pas na een echte SUCCESSFUL betaling de WooCommerce-order aan.
      const transaction = await waitForTransaction(merchantCode, clientTransactionId);
      return res.status(200).json({ success: true, readerId: targetReaderId, clientTransactionId, transaction, checkout: checkout.data });
    }

    if (action === 'transaction' && req.query.clientTransactionId) {
      const transaction = await getTransaction(merchantCode, req.query.clientTransactionId);
      return res.status(200).json({ success: true, transaction: transaction?.data || transaction });
    }

    if (action === 'checkout' && readerId && checkoutId) {
      const data = await sumup(`/v0.1/merchants/${encodeURIComponent(merchantCode)}/readers/${encodeURIComponent(readerId)}/checkout/${encodeURIComponent(checkoutId)}`, { method: 'GET' });
      return res.status(200).json({ success: true, checkout: data.data || data });
    }

    if (action === 'terminate' && readerId) {
      const data = await sumup(`/v0.1/merchants/${encodeURIComponent(merchantCode)}/readers/${encodeURIComponent(readerId)}/terminate`, { method: 'POST', body: '{}' });
      return res.status(200).json({ success: true, result: data });
    }

    if (action === 'receipt' && transactionId) {
      const data = await sumup(`/v1.1/receipts/${encodeURIComponent(transactionId)}?mid=${encodeURIComponent(merchantCode)}`, { method: 'GET' });
      return res.status(200).json({ success: true, receipt: data });
    }

    return res.status(400).json({ success: false, error: 'Onbekende actie' });
  } catch (error) {
    console.error('SumUp Cloud API Error:', error);
    return res.status(500).json({ success: false, error: error.message || 'SumUp Cloud API fout' });
  }
}
