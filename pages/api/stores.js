import pool from '../../lib/db';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const [rows] = await pool.query('SELECT * FROM pos_stores');
      return res.status(200).json({ success: true, stores: rows });
    }

    if (req.method === 'POST') {
      const { name, location } = req.body;
      if (!name) return res.status(400).json({ success: false, error: 'Winkelnaam is verplicht.' });

      const id = 'store-' + Date.now();
      await pool.query('INSERT INTO pos_stores (id, name, location) VALUES (?, ?, ?)', [
        id, 
        name, 
        location || 'Filiaal'
      ]);

      return res.status(200).json({ success: true, message: 'Winkel toegevoegd' });
    }

    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, error: 'ID is verplicht.' });

      await pool.query('DELETE FROM pos_stores WHERE id = ?', [id]);
      return res.status(200).json({ success: true, message: 'Winkel verwijderd' });
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (error) {
    console.error('Database error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}