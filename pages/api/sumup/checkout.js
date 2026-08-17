import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { totalAmount, terminalId } = req.body;

  if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
    return res.status(400).json({ success: false, error: 'Ongeldig of ontbrekend bedrag.' });
  }

  if (!terminalId) {
    return res.status(400).json({ success: false, error: 'Geen Terminal ID opgegeven.' });
  }

  const sumupApiKey = process.env.SUMUP_API_KEY || process.env.SUMUP_SECRET_KEY;

  if (!sumupApiKey) {
    return res.status(500).json({ success: false, error: 'SumUp API-sleutel (SUMUP_API_KEY) ontbreekt in de .env omgeving.' });
  }

  try {
    // Direct verzoek sturen naar de SumUp Terminal met je API Key (Bearer token)
    const checkoutRes = await axios.post(
      `https://api.sumup.com/v0.1/terminals/${terminalId}/checkouts`,
      {
        amount: parseFloat(totalAmount),
        currency: 'EUR',
        checkout_reference: `BDM-POS-${Date.now()}`
      },
      {
        headers: {
          'Authorization': `Bearer ${sumupApiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const checkoutData = checkoutRes.data;

    return res.status(200).json({
      success: true,
      transactionId: checkoutData.id,
      data: checkoutData,
      message: 'Bedrag is naar de pinautomaat gestuurd!'
    });

  } catch (error) {
    console.error('[SUMUP TERMINAL API ERROR]:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message || 'Fout bij communicatie met SumUp.'
    });
  }
}