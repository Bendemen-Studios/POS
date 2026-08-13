// pages/api/sumup/checkout.js
import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { totalAmount, terminalId } = req.body; // terminalId is het serienummer van je SumUp apparaat

  try {
    // STAP 1: Haal een tijdelijke Access Token op bij SumUp
    // Hiervoor heb je een Client ID en Client Secret nodig uit je SumUp Developer Dashboard
    const tokenResponse = await axios.post('https://api.sumup.com/token', {
      grant_type: 'client_credentials',
      client_id: process.env.SUMUP_CLIENT_ID,
      client_secret: process.env.SUMUP_CLIENT_SECRET,
    }, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const accessToken = tokenResponse.data.access_token;

    // STAP 2: Stuur het verzoek naar de specifieke SumUp Terminal
    // Let op: Dit vereist dat je terminal (bijv. de Solo of 3G) verbonden is met WiFi/Cloud
    const checkoutResponse = await axios.post(`https://api.sumup.com/v0.1/terminals/${terminalId}/checkouts`, {
      amount: totalAmount,
      currency: 'EUR',
      checkout_reference: `POS-${Date.now()}` // Unieke code voor deze transactie
    }, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    // STAP 3: In een productie-omgeving zou je hier een 'webhook' of 'polling' gebruiken 
    // om te wachten tot de klant zijn pas erop heeft gelegd. 
    // Voor nu sturen we de succes-status van het *verzenden* naar de terminal terug.
    
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