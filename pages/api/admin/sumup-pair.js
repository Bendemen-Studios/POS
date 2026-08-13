import db from '../../../lib/db';
import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { storeId, pairingCode, readerName } = req.body;

  if (!storeId || !pairingCode) {
    return res.status(400).json({ success: false, error: 'Selecteer een winkel en vul de pairing code in.' });
  }

  try {
    const sumupApiKey = process.env.SUMUP_API_KEY;
    const merchantCode = process.env.SUMUP_MERCHANT_CODE;

    // Optioneel: SumUp API koppeling als de keys in .env staan
    if (sumupApiKey && merchantCode) {
      await axios.post(
        `https://api.sumup.com/v0.1/merchants/${merchantCode}/readers`,
        {
          pairing_code: pairingCode,
          name: readerName || `Kassa - ${storeId}`
        },
        {
          headers: {
            Authorization: `Bearer ${sumupApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    // Sla de reader ID op in de database via de algemene db-verbinding
    await db.execute(
      'UPDATE stores SET sumup_reader_id = ? WHERE id = ?',
      [pairingCode, storeId]
    );

    return res.status(200).json({ success: true, message: 'Pinapparaat succesvol gekoppeld aan de winkel!' });
  } catch (error) {
    console.error('SumUp pairing fout:', error.response?.data || error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.response?.data?.message || 'Fout bij koppelen van SumUp reader.' 
    });
  }
}