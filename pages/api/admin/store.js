import pool from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const [rows] = await pool.execute('SELECT * FROM pos_stores LIMIT 1');
      
      if (rows.length === 0) {
        return res.status(200).json({ 
          success: true, 
          store: null, 
          message: 'Geen winkelinstellingen gevonden in de database.' 
        });
      }

      return res.status(200).json({ success: true, store: rows[0] });
    } catch (error) {
      console.error("Database Store GET Error:", error);
      return res.status(500).json({ success: false, error: 'Databasefout bij ophalen winkelinstellingen.' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { id, store_name, address, register_status, receipt_header, receipt_footer } = req.body;

      if (!store_name) {
        return res.status(400).json({ success: false, message: 'Winkelnaam is verplicht.' });
      }

      if (id) {
        // Update bestaand record
        await pool.execute(
          `UPDATE pos_stores 
           SET store_name = ?, address = ?, register_status = ?, receipt_header = ?, receipt_footer = ? 
           WHERE id = ?`,
          [store_name, address || '', register_status || 'open', receipt_header || '', receipt_footer || '', id]
        );
      } else {
        // Voeg nieuw record toe
        await pool.execute(
          `INSERT INTO pos_stores (store_name, address, register_status, receipt_header, receipt_footer) 
           VALUES (?, ?, ?, ?, ?)`,
          [store_name, address || '', register_status || 'open', receipt_header || '', receipt_footer || '']
        );
      }

      return res.status(200).json({
        success: true,
        message: 'Winkelinstellingen succesvol opgeslagen in de database!'
      });
    } catch (error) {
      console.error("Database Store POST Error:", error);
      return res.status(500).json({ success: false, error: 'Databasefout bij opslaan winkelinstellingen.' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ success: false, message: `Method ${req.method} not allowed` });
}