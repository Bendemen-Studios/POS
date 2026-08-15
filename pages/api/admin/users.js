import db from '../../../lib/db';

export default async function handler(req, res) {
  const { method } = req;

  // 1. MEDEWERKERS OPHALEN INCLUSIEF FILIAALNAAM
  if (method === 'GET') {
    try {
      const [rows] = await db.query(`
        SELECT 
          u.id, 
          u.username, 
          u.role, 
          u.store_id, 
          u.email, 
          COALESCE(s.store_name, s.name, 'Geen') AS store_name 
        FROM users u 
        LEFT JOIN stores s ON u.store_id = s.id
      `);
      
      const usersList = Array.isArray(rows) ? rows : [];
      return res.status(200).json({ success: true, users: usersList });
    } catch (error) {
      console.error('Fout bij ophalen gebruikers met join, terugvallen op basisquery:', error.message);      
      try {
        const [fallbackRows] = await db.query('SELECT id, username, role, store_id, email FROM users');
        return res.status(200).json({ success: true, users: Array.isArray(fallbackRows) ? fallbackRows : [] });
      } catch (fallbackError) {
        return res.status(500).json({ success: false, error: fallbackError.message });
      }
    }
  }

  // 2. NIEUWE MEDEWERKER AANMAKEN EN FILIAAL OPSLAAN
  if (method === 'POST') {
    const { username, password, role, store_id, email } = req.body;
    try {
      const parsedStoreId = (store_id !== null && store_id !== undefined && store_id !== '' && store_id !== 'null' && store_id !== '0') 
        ? Number(store_id) 
        : null;

      console.log(`Nieuwe medewerker opslaan: username=${username}, role=${role}, store_id=${parsedStoreId}`);

      const [result] = await db.query(
        'INSERT INTO users (username, password, role, store_id, email) VALUES (?, ?, ?, ?, ?)',
        [username, password, role || 'cashier', parsedStoreId, email || null]
      );

      return res.status(200).json({ success: true, userId: result.insertId });
    } catch (error) {
      console.error('Fout bij aanmaken gebruiker:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // 3. BESTAANDE MEDEWERKER BEWERKEN EN FILIAAL BIJWERKEN
  if (method === 'PUT') {
    const { id, username, password, role, store_id } = req.body;
    try {
      if (username && username.toLowerCase() === 'bendemen') {
        return res.status(403).json({ success: false, error: 'Het hoofdaccount bendemen kan niet worden aangepast.' });
      }

      const parsedStoreId = (store_id !== null && store_id !== undefined && store_id !== '' && store_id !== 'null' && store_id !== '0') 
        ? Number(store_id) 
        : null;

      console.log(`Update medewerker ID ${id}: role=${role}, store_id=${parsedStoreId}`);

      if (password && password.trim() !== '') {
        await db.query(
          'UPDATE users SET username = ?, password = ?, role = ?, store_id = ? WHERE id = ?',
          [username, password, role, parsedStoreId, id]
        );
      } else {
        await db.query(
          'UPDATE users SET username = ?, role = ?, store_id = ? WHERE id = ?',
          [username, role, parsedStoreId, id]
        );
      }

      return res.status(200).json({ success: true, message: 'Gebruiker bijgewerkt' });
    } catch (error) {
      console.error('Fout bij bijwerken gebruiker:', error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // 4. MEDEWERKER VERWIJDEREN
  if (method === 'DELETE') {
    const { id } = req.query;
    try {
      const [rows] = await db.query('SELECT username FROM users WHERE id = ?', [id]);
      const user = Array.isArray(rows) ? rows[0] : null;

      if (user && user.username && user.username.toLowerCase() === 'bendemen') {
        return res.status(403).json({ success: false, error: 'Het hoofdaccount bendemen kan niet worden verwijderd.' });
      }

      await db.query('DELETE FROM users WHERE id = ?', [id]);
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
  res.status(405).end(`Method ${method} Not Allowed`);
}