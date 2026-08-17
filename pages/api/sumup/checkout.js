import axios from 'axios';
import db from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const { totalAmount, storeId } = req.body;

  if (!totalAmount || isNaN(totalAmount) || totalAmount <= 0) {
    return res.status(400).json({ success: false, error: 'Ongeldig of ontbrekend bedrag.' });
  }

  // Veilig inlezen vanuit de server omgeving (.env)
  const sumupApiKey = process.env.SUMUP_API_KEY || process.env.SUMUP_SECRET_KEY;
  const merchantCode = process.env.SUMUP_MERCHANT_CODE;

  if (!sumupApiKey || !merchantCode) {
    return res.status(500).json({ success: false, error: 'SumUp API-sleutel of Merchant Code ontbreekt in de .env omgeving.' });
  }

  try {
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

    if (!terminalId) {
      const [rows] = await db.query('SELECT terminal_id FROM stores WHERE terminal_id IS NOT NULL LIMIT 1');
      if (rows && rows.length > 0) {
        terminalId = rows[0].terminal_id;
      }
    }

    if (!terminalId) {
      return res.status(400).json({ success: false, error: 'Geen Terminal ID gevonden in de database.' });
    }

    const checkoutPayload = {
      amount: parseFloat(totalAmount),
      currency: 'EUR',
      payment_type: 'reader',
      reader_id: terminalId.trim(),
      merchant_code: merchantCode.trim(),
      checkout_reference: `BDM-POS-${Date.now()}`
    };

    const checkoutRes = await axios.post(
      'https://api.sumup.com/v0.1/checkouts',
      checkoutPayload,
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
    console.error('[SUMUP CHECKOUT API ERROR]:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message || 'Fout bij communicatie met SumUp.'
    });
  }
}