import db from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { storeId, pairingCode } = req.body;

  if (!storeId || !pairingCode) {
    return res.status(400).json({ success: false, error: 'Filiaal ID en Pair Code zijn verplicht.' });
  }

  const merchantCode = process.env.SUMUP_MERCHANT_CODE;
  const apiKey = process.env.SUMUP_API_KEY;

  if (!apiKey || !merchantCode) {
    return res.status(500).json({ success: false, error: 'SUMUP_API_KEY of SUMUP_MERCHANT_CODE ontbreekt in de .env omgeving op de server.' });
  }

  try {
    // Stuur de koppelcode naar het juiste SumUp Readers endpoint om hem om te zetten
    const pairRes = await fetch(`https://api.sumup.com/v0.1/merchants/${merchantCode}/readers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        pairing_code: pairingCode.trim(),
        name: `POS Filiaal ${storeId}`
      })
    });

    const pairData = await pairRes.json();

    if (!pairRes.ok) {
      console.error('[SUMUP PAIR ERROR]:', pairData);
      throw new Error(pairData.message || pairData.detail || 'SumUp weigert de koppelcode (mogelijk verlopen).');
    }

    // SumUp retourneert de unieke reader/terminal ID (bijv. rdr_...)
    const terminalId = pairData.id;

    if (!terminalId) {
      throw new Error('Geen Terminal ID ontvangen van SumUp.');
    }

    // Sla de Terminal ID op en zet pair_code op "Verbonden"
    await db.query(
      'UPDATE stores SET terminal_id = ?, pair_code = "Verbonden" WHERE id = ? OR store_id = ?',
      [terminalId, storeId, storeId]
    );

    return res.status(200).json({
      success: true,
      terminalId,
      message: 'Koppelcode succesvol omgezet naar Terminal ID!'
    });

  } catch (error) {
    console.error('SumUp pairing fout:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}