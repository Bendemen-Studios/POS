import pool from '../../../lib/db';

export default async function handler(req, res) {
  // GET: Haal alle winkellocaties op
  if (req.method === 'GET') {
    try {
      const [rows] = await pool.execute('SELECT * FROM pos_stores ORDER BY id ASC');
      return res.status(200).json({ success: true, stores: rows });
    } catch (error) {
      console.error("Database Store GET Error:", error);
      return res.status(500).json({ success: false, error: 'Databasefout bij ophalen locaties.' });
    }
  }

  // POST: Nieuwe locatie toevoegen OF bestaande locatie bewerken
  if (req.method === 'POST') {
    try {
      const { id, store_name, address, receipt_header, receipt_footer } = req.body;

      if (!store_name) {
        return res.status(400).json({ success: false, message: 'Locatienaam is verplicht.' });
      }

      if (id) {
        // Update een specifieke locatie
        await pool.execute(
          `UPDATE pos_stores 
           SET store_name = ?, address = ?, receipt_header = ?, receipt_footer = ? 
           WHERE id = ?`,
          [store_name, address || '', receipt_header || '', receipt_footer || '', id]
        );
      } else {
        // Voeg een nieuwe locatie toe
        await pool.execute(
          `INSERT INTO pos_stores (store_name, address, receipt_header, receipt_footer) 
           VALUES (?, ?, ?, ?)`,
          [store_name, address || '', receipt_header || '', receipt_footer || '']
        );
      }

      return res.status(200).json({
        success: true,
        message: 'Locatie succesvol opgeslagen in de database!'
      });
    } catch (error) {
      console.error("Database Store POST Error:", error);
      return res.status(500).json({ success: false, error: 'Databasefout bij opslaan locatie.' });
    }
  }

  // DELETE: Locatie verwijderen op basis van ID
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) {
        return res.status(400).json({ success: false, message: 'Geen locatie ID opgegeven.' });
      }

      await pool.execute('DELETE FROM pos_stores WHERE id = ?', [id]);

      return res.status(200).json({
        success: true,
        message: 'Locatie succesvol verwijderd uit de database!'
      });
    } catch (error) {
      console.error("Database Store DELETE Error:", error);
      return res.status(500).json({ success: false, error: 'Databasefout bij verwijderen locatie.' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).json({ success: false, message: `Method ${req.method} not allowed` });
}