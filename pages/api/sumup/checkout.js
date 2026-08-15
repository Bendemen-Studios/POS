export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { totalAmount, terminalId } = req.body;

  // 1. Controleer vereiste invoersparameters
  if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
    return res.status(400).json({ success: false, error: 'Ongeldig of ontbrekend bedrag.' });
  }

  if (!terminalId) {
    return res.status(400).json({ success: false, error: 'Geen Terminal ID opgegeven.' });
  }

  const clientId = process.env.SUMUP_CLIENT_ID;
  const clientSecret = process.env.SUMUP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ success: false, error: 'SumUp API credentials (CLIENT_ID / CLIENT_SECRET) ontbreken in de .env omgeving.' });
  }

  try {
    // STAP 1: Access Token ophalen bij SumUp (application/x-www-form-urlencoded)
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

    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.message || 'Kon geen OAuth access token ophalen bij SumUp.');
    }

    const accessToken = tokenData.access_token;

    // STAP 2: Verzoek sturen naar de SumUp Terminal
    const checkoutRes = await fetch(`https://api.sumup.com/v0.1/terminals/${terminalId}/checkouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: parseFloat(totalAmount),
        currency: 'EUR',
        checkout_reference: `BDM-POS-${Date.now()}`
      })
    });

    const checkoutData = await checkoutRes.json();

    if (!checkoutRes.ok) {
      throw new Error(checkoutData.message || checkoutData.error || 'Fout bij versturen van checkout naar terminal.');
    }

    return res.status(200).json({
      success: true,
      transactionId: checkoutData.id,
      data: checkoutData,
      message: 'Bedrag is naar de pinautomaat gestuurd!'
    });

  } catch (error) {
    console.error('[SUMUP TERMINAL API ERROR]:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Fout bij communicatie met SumUp.'
    });
  }
}