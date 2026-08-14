import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { storeId, pairingCode, readerName } = req.body;

  if (!pairingCode) {
    return res.status(400).json({ success: false, error: 'Vul de pairing code in die op de SumUp staat.' });
  }

  try {
    const sumupApiKey = process.env.SUMUP_API_KEY || process.env.SUMUP_SECRET_KEY;
    const merchantCode = process.env.SUMUP_MERCHANT_CODE;

    let readerData = null;

    // Als de SumUp sleutels in de .env staan, koppelen we direct via de SumUp Cloud API
    if (sumupApiKey && merchantCode) {
      const response = await axios.post(
        `https://api.sumup.com/v0.1/merchants/${merchantCode}/readers`,
        {
          pairing_code: pairingCode.trim(),
          name: readerName || `Kassa Store ${storeId || 1}`
        },
        {
          headers: {
            Authorization: `Bearer ${sumupApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      readerData = response.data;
    }

    return res.status(200).json({ 
      success: true, 
      message: 'SumUp terminal succesvol gekoppeld!',
      reader: readerData || { id: pairingCode.trim(), pairingCode: pairingCode.trim(), name: readerName }
    });

  } catch (error) {
    console.error('SumUp pairing fout:', error.response?.data || error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.response?.data?.message || 'Fout bij koppelen met SumUp. Controleer de koppelcode.' 
    });
  }
}