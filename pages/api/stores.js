import db from '../../lib/db';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const [rows] = await db.execute('SELECT * FROM stores');
      return res.status(200).json({ success: true, stores: rows });
    } catch (error) {
      console.error('Fout bij ophalen winkels:', error);
      return res.status(500).json({ success: false, error: 'Database fout' });
    }
  }
  
  if (req.method === 'POST') {
    const { name, location } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Naam is verplicht' });

    const id = 'store_' + Date.now();
    try {
      await db.execute('INSERT INTO stores (id, name, location) VALUES (?, ?, ?)', [id, name, location || 'Hoofdvestiging']);
      return res.status(200).json({ success: true, message: 'Winkel toegevoegd' });
    } catch (error) {
      return res.status(500).json({ success: false, error: 'Fout bij toevoegen' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end(`Method ${req.method} Not Allowed`);
}