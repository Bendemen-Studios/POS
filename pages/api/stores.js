import pool from '../../lib/db';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const [rows] = await pool.query('SELECT * FROM pos_stores');
      return res.status(200).json({ success: true, stores: rows });
    } catch (error) {
      console.error('Fout bij ophalen winkels:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }
  
  if (req.method === 'POST') {
    const { name, location } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Winkelnaam is verplicht' });
    }

    const id = 'store_' + Date.now();
    try {
      await pool.query(
        'INSERT INTO pos_stores (id, name, location) VALUES (?, ?, ?)',
        [id, name, location || 'Hellevoetsluis']
      );
      return res.status(200).json({ success: true, message: 'Winkel succesvol toegevoegd' });
    } catch (error) {
      console.error('Fout bij toevoegen winkel:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Winkel ID is verplicht' });
    }

    try {
      await pool.query('DELETE FROM pos_stores WHERE id = ?', [id]);
      return res.status(200).json({ success: true, message: 'Winkel succesvol verwijderd' });
    } catch (error) {
      console.error('Fout bij verwijderen winkel:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}