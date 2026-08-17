import db from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { storeId, pairingCode, terminalId: manualTerminalId } = req.body;

  if (!storeId || (!pairingCode && !manualTerminalId)) {
    return res.status(400).json({ success: false, error: 'Filiaal ID en een Pair Code of Terminal ID zijn verplicht.' });
  }

  try {
    let terminalId = manualTerminalId;

    // Als er een pairing code is ingevoerd, probeer via API te koppelen
    if (pairingCode && !manualTerminalId) {
      const clientId = process.env.SUMUP_CLIENT_ID;
      const clientSecret = process.env.SUMUP_CLIENT_SECRET;
      const apiKey = process.env.SUMUP_API_KEY;

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

      const pairRes = await fetch('https://api.sumup.com/v0.1/terminals/pair', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pairing_code: pairingCode.trim() })
      });

      const pairData = await pairRes.json();
      if (!pairRes.ok) {
        throw new Error(pairData.message || pairData.detail || 'SumUp weigert de koppelcode.');
      }
      terminalId = pairData.id || pairData.terminal_id;
    }

    if (!terminalId) {
      throw new Error('Geen geldige Terminal ID gevonden.');
    }

    // Sla de Terminal ID direct op in de database
    await db.query(
      'UPDATE stores SET terminal_id = ?, pair_code = "Verbonden" WHERE id = ? OR store_id = ?',
      [terminalId, storeId, storeId]
    );

    return res.status(200).json({
      success: true,
      terminalId,
      message: 'Terminal ID succesvol opgeslagen!'
    });

  } catch (error) {
    console.error('SumUp pairing fout:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}