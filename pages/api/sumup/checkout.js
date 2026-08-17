import axios from 'axios';
import db from '../../../lib/db'; // Zorg dat dit pad naar je database-configuratie wijst

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { totalAmount, storeId } = req.body;

  if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
    return res.status(400).json({ success: false, error: 'Ongeldig of ontbrekend bedrag.' });
  }

  const sumupApiKey = process.env.SUMUP_API_KEY || process.env.SUMUP_SECRET_KEY;

  if (!sumupApiKey) {
    return res.status(500).json({ success: false, error: 'SumUp API-sleutel ontbreekt in de .env omgeving.' });
  }

  try {
    // 1. Haal de Terminal ID automatisch op uit de database voor dit filiaal
    let terminalId = req.body.terminalId;

    if (!terminalId && storeId) {
      const [rows] = await db.query(
        'SELECT terminal_id FROM stores WHERE id = ? OR store_id = ? LIMIT 1',
        [storeId, storeId]
      );
      if (rows && rows.length > 0) {
        terminalId = rows[0].terminal_id;
      }
    }

    // Als we nog steeds geen terminalId hebben, pak dan de eerste de beste actieve uit de database
    if (!terminalId) {
      const [rows] = await db.query('SELECT terminal_id FROM stores WHERE terminal_id IS NOT NULL LIMIT 1');
      if (rows && rows.length > 0) {
        terminalId = rows[0].terminal_id;
      }
    }

    if (!terminalId) {
      return res.status(400).json({ success: false, error: 'Geen Terminal ID gevonden in de database. Koppel eerst je pinautomaat in het admin paneel.' });
    }

    // 2. Stuur het verzoek naar de SumUp Terminal API met de opgehaalde Terminal ID
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