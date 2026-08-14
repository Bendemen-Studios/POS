import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { totalAmount, terminalId } = req.body;

  try {
    // STAP 1: Access Token ophalen bij SumUp
    const tokenResponse = await axios.post('https://api.sumup.com/token', {
      grant_type: 'client_credentials',
      client_id: process.env.SUMUP_CLIENT_ID,
      client_secret: process.env.SUMUP_CLIENT_SECRET,
    }, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const accessToken = tokenResponse.data.access_token;

    // STAP 2: Verzoek sturen naar de SumUp Terminal
    const checkoutResponse = await axios.post(`https://api.sumup.com/v0.1/terminals/${terminalId}/checkouts`, {
      amount: totalAmount,
      currency: 'EUR',
      checkout_reference: `POS-${Date.now()}`
    }, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    res.status(200).json({ 
      success: true, 
      transactionId: checkoutResponse.data.id,
      message: 'Bedrag is naar de pinautomaat gestuurd!'
    });

  } catch (error) {
    console.error("SumUp API Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Fout bij communicatie met SumUp' });
  }
}