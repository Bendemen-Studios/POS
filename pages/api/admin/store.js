import pool from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const [rows] = await pool.execute('SELECT * FROM pos_stores ORDER BY id ASC');
      
      // Mocht een kolom 'name' heten i.p.v. 'store_name', mappen we die hier automatisch om
      const formattedStores = rows.map(s => ({
        ...s,
        store_name: s.store_name || s.name || 'Ons Winkeltje'
      }));

      return res.status(200).json({ success: true, stores: formattedStores });
    } catch (error) {
      console.error("Database Store GET Error:", error);
      return res.status(500).json({ success: false, error: 'Databasefout bij ophalen locaties.' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { id, store_name, name, address, receipt_header, receipt_footer } = req.body;
      const finalName = store_name || name || 'Ons Winkeltje';

      if (id) {
        // Probeer eerst met store_name, anders fallback naar name
        try {
          await pool.execute(
            `UPDATE pos_stores 
             SET store_name = ?, address = ?, receipt_header = ?, receipt_footer = ? 
             WHERE id = ?`,
            [finalName, address || '', receipt_header || '', receipt_footer || '', id]
          );
        } catch (e) {
          await pool.execute(
            `UPDATE pos_stores 
             SET name = ?, address = ?, receipt_header = ?, receipt_footer = ? 
             WHERE id = ?`,
            [finalName, address || '', receipt_header || '', receipt_footer || '', id]
          );
        }
      } else {
        try {
          await pool.execute(
            `INSERT INTO pos_stores (store_name, address, receipt_header, receipt_footer) 
             VALUES (?, ?, ?, ?)`,
            [finalName, address || '', receipt_header || '', receipt_footer || '']
          );
        } catch (e) {
          await pool.execute(
            `INSERT INTO pos_stores (name, address, receipt_header, receipt_footer) 
             VALUES (?, ?, ?, ?)`,
            [finalName, address || '', receipt_header || '', receipt_footer || '']
          );
        }
      }

      return res.status(200).json({ success: true, message: 'Locatie opgeslagen in database!' });
    } catch (error) {
      console.error("Database Store POST Error:", error);
      return res.status(500).json({ success: false, error: 'Databasefout bij opslaan locatie.' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, message: 'Geen locatie ID opgegeven.' });

      await pool.execute('DELETE FROM pos_stores WHERE id = ?', [id]);
      return res.status(200).json({ success: true, message: 'Locatie verwijderd.' });
    } catch (error) {
      console.error("Database Store DELETE Error:", error);
      return res.status(500).json({ success: false, error: 'Databasefout bij verwijderen locatie.' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).json({ success: false, message: `Method ${req.method} not allowed` });
}