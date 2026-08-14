import pool from '../../../lib/db';

export default async function handler(req, res) {
  // GET: Haal alle locaties op
  if (req.method === 'GET') {
    try {
      const [rows] = await pool.execute('SELECT * FROM pos_stores ORDER BY id ASC');
      
      const formattedStores = rows.map(s => ({
        ...s,
        // Gebruik eerst store_name, anders name, en pas als beidde echt leeg zijn een lege string
        store_name: s.store_name ?? s.name ?? '',
        address: s.address ?? s.location ?? '',
        receipt_header: s.receipt_header ?? '',
        receipt_footer: s.receipt_footer ?? ''
      }));

      return res.status(200).json({ success: true, stores: formattedStores });
    } catch (error) {
      console.error("Database Store GET Error:", error);
      return res.status(500).json({ success: false, error: 'Databasefout bij ophalen locaties.' });
    }
  }

  // POST: Opslaan / Bewerken
  if (req.method === 'POST') {
    try {
      const { id, store_name, name, address, receipt_header, receipt_footer } = req.body;
      
      // Pak de ingevoerde naam (bijv. "test") direct op
      const finalName = store_name || name;

      if (!finalName) {
        return res.status(400).json({ success: false, message: 'Locatienaam mag niet leeg zijn.' });
      }

      const storeId = id ? String(id) : `store_${Date.now()}`;

      if (id) {
        // Probeer update op store_name en name
        try {
          await pool.execute(
            `UPDATE pos_stores 
             SET store_name = ?, name = ?, address = ?, receipt_header = ?, receipt_footer = ? 
             WHERE id = ?`,
            [finalName, finalName, address || '', receipt_header || '', receipt_footer || '', storeId]
          );
        } catch (err) {
          // Fallback als store_name kolom niet bestaat
          await pool.execute(
            `UPDATE pos_stores 
             SET name = ?, address = ?, receipt_header = ?, receipt_footer = ? 
             WHERE id = ?`,
            [finalName, address || '', receipt_header || '', receipt_footer || '', storeId]
          );
        }
      } else {
        // Nieuwe winkel invoegen met ingegeven naam
        try {
          await pool.execute(
            `INSERT INTO pos_stores (id, store_name, name, address, receipt_header, receipt_footer) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [storeId, finalName, finalName, address || '', receipt_header || '', receipt_footer || '']
          );
        } catch (err) {
          await pool.execute(
            `INSERT INTO pos_stores (id, name, address, receipt_header, receipt_footer) 
             VALUES (?, ?, ?, ?, ?)`,
            [storeId, finalName, address || '', receipt_header || '', receipt_footer || '']
          );
        }
      }

      return res.status(200).json({ success: true, message: 'Locatie succesvol opgeslagen!' });
    } catch (error) {
      console.error("Database Store POST Error:", error);
      return res.status(500).json({ success: false, error: 'Fout bij opslaan in database.' });
    }
  }

  // DELETE: Verwijderen
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, message: 'Geen ID opgegeven.' });

      await pool.execute('DELETE FROM pos_stores WHERE id = ?', [String(id)]);
      return res.status(200).json({ success: true, message: 'Locatie verwijderd.' });
    } catch (error) {
      console.error("Database Store DELETE Error:", error);
      return res.status(500).json({ success: false, error: 'Fout bij verwijderen.' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).json({ success: false, message: `Method ${req.method} not allowed` });
}