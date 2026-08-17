import db from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { storeId, terminalId } = req.body;

  if (!storeId || !terminalId) {
    return res.status(400).json({ success: false, error: 'Filiaal ID en Terminal ID zijn verplicht.' });
  }

  try {
    // Sla direct de Terminal ID op en maak/houd pair_code leeg (NULL)
    await db.query(
      'UPDATE stores SET terminal_id = ?, pair_code = NULL WHERE id = ? OR store_id = ?',
      [terminalId.trim(), storeId, storeId]
    );

    return res.status(200).json({
      success: true,
      terminalId: terminalId.trim(),
      message: 'Terminal ID succesvol opgeslagen!'
    });

  } catch (error) {
    console.error('Opslaan terminal fout:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}