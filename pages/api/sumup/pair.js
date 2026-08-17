import db from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { storeId, pairingCode } = req.body;

  if (!storeId || !pairingCode) {
    return res.status(400).json({ success: false, error: 'Filiaal ID en Pair Code zijn verplicht.' });
  }

  const clientId = process.env.SUMUP_CLIENT_ID;
  const clientSecret = process.env.SUMUP_CLIENT_SECRET;
  const apiKey = process.env.SUMUP_API_KEY;

  try {
    // 1. Token ophalen om te koppelen
    let accessToken = apiKey;
    if (!accessToken && clientId && clientSecret) {
      const tokenParams = new URLSearchParams();
      tokenParams.append('grant_type', 'client_credentials');
      tokenParams.append('client_id', clientId);
      tokenParams.append('client_secret', clientSecret);

      const tokenRes = await fetch('https://api.sumup.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString()
      });
      const tokenData = await tokenRes.json();
      if (tokenRes.ok && tokenData.access_token) {
        accessToken = tokenData.access_token;
      }
    }

    if (!accessToken) {
      return res.status(500).json({ success: false, error: 'Geen geldige SumUp API-sleutel of credentials gevonden.' });
    }

    // 2. Koppelingsverzoek sturen naar SumUp
    const pairRes = await fetch('https://api.sumup.com/v0.1/terminals/pair', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pairing_code: pairingCode })
    });

    const pairData = await pairRes.json();

    if (!pairRes.ok) {
      throw new Error(pairData.message || pairData.error || 'SumUp weigert de koppelcode (mogelijk verlopen of ongeldig).');
    }

    const terminalId = pairData.id || pairData.terminal_id;

    if (!terminalId) {
      throw new Error('Geen Terminal ID ontvangen van SumUp.');
    }

    // 3. Sla de Terminal ID op en zet bij pair_code de tekst "Verbonden"
    await db.query(
      'UPDATE stores SET terminal_id = ?, pair_code = "Verbonden" WHERE id = ? OR store_id = ?',
      [terminalId, storeId, storeId]
    );

    return res.status(200).json({
      success: true,
      terminalId,
      message: 'Terminal succesvol gekoppeld!'
    });

  } catch (error) {
    console.error('SumUp pairing fout:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}