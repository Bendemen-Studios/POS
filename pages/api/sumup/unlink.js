import db from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { storeId } = req.body;

  if (!storeId) {
    return res.status(400).json({ success: false, error: 'Geen filiaal ID opgegeven.' });
  }

  try {
    // Maak zowel de terminal_id als pair_code leeg in de database
    await db.query(
      'UPDATE stores SET terminal_id = NULL, pair_code = NULL WHERE id = ? OR store_id = ?',
      [storeId, storeId]
    );

    return res.status(200).json({ 
      success: true, 
      message: 'SumUp koppeling succesvol verbroken.' 
    });

  } catch (error) {
    console.error('SumUp ontkoppel fout:', error.message);
    return res.status(500).json({ 
      success: false, 
      error: 'Fout bij ontkoppelen van SumUp.' 
    });
  }
}