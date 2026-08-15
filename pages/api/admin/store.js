import db from '../../../lib/db';

export default async function handler(req, res) {
  const { method } = req;

  if (method === 'GET') {
    try {
      const [rows] = await db.query('SELECT * FROM stores');
      const formattedStores = (Array.isArray(rows) ? rows : []).map((s) => ({
        ...s,
        id: s.id,
        store_id: s.id,
        store_name: s.store_name || 'Onbekend Filiaal'
      }));
      return res.status(200).json({ success: true, stores: formattedStores });
    } catch (error) {
      console.error('Fout bij ophalen winkels:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (method === 'POST') {
    const { store_name, address, receipt_header, receipt_footer, pickup_id, terminal_id } = req.body;
    try {
      const customId = `store_${Date.now()}`;
      await db.query(
        'INSERT INTO stores (id, store_name, address, receipt_header, receipt_footer, pickup_id, terminal_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [customId, store_name, address || null, receipt_header || null, receipt_footer || null, pickup_id || null, terminal_id || null]
      );
      return res.status(200).json({ success: true, id: customId });
    } catch (error) {
      console.error('Fout bij toevoegen winkel:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (method === 'PUT') {
    const { id, store_id, store_name, address, receipt_header, receipt_footer, pickup_id, terminal_id } = req.body;
    const targetId = id || store_id;
    try {
      await db.query(
        'UPDATE stores SET store_name = ?, address = ?, receipt_header = ?, receipt_footer = ?, pickup_id = ?, terminal_id = ? WHERE id = ?',
        [store_name, address || null, receipt_header || null, receipt_footer || null, pickup_id || null, terminal_id || null, targetId]
      );
      return res.status(200).json({ success: true, message: 'Filiaal bijgewerkt' });
    } catch (error) {
      console.error('Fout bij bijwerken winkel:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (method === 'DELETE') {
    const { id } = req.query;
    try {
      const [countRows] = await db.query('SELECT COUNT(*) AS total FROM stores');
      const totalStores = countRows[0]?.total || 0;

      if (totalStores <= 1) {
        return res.status(400).json({
          success: false,
          error: 'Er moet minimaal 1 actief filiaal in het systeem aanwezig blijven.'
        });
      }

      await db.query('DELETE FROM stores WHERE id = ?', [id]);
      await db.query('UPDATE users SET store_id = NULL WHERE store_id = ?', [id]);

      return res.status(200).json({ success: true, message: 'Filiaal succesvol verwijderd' });
    } catch (error) {
      console.error('Fout bij verwijderen winkel:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
  res.status(405).end(`Method ${method} Not Allowed`);
}