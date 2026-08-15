import db from '../../../lib/db';

export default async function handler(req, res) {
  const { method } = req;

  // 1. Zorg dat de store_id tabel kolom VARCHAR accepteert
  try {
    await db.query('ALTER TABLE users MODIFY COLUMN store_id VARCHAR(255) DEFAULT NULL');
  } catch (e) {
    // Negeer als kolom al VARCHAR is
  }

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
        LEFT JOIN stores s ON CAST(u.store_id AS CHAR) = CAST(s.id AS CHAR)
      `);
      
      return res.status(200).json({ success: true, users: Array.isArray(rows) ? rows : [] });
    } catch (error) {
      console.error('Fout bij ophalen gebruikers:', error.message);
      try {
        const [fallbackRows] = await db.query('SELECT id, username, role, store_id, email FROM users');
        return res.status(200).json({ success: true, users: Array.isArray(fallbackRows) ? fallbackRows : [] });
      } catch (fallbackError) {
        return res.status(500).json({ success: false, error: fallbackError.message });
      }
    }
  }

  if (method === 'POST') {
    const { username, password, role, store_id, email } = req.body;
    try {
      const parsedStoreId = (store_id && store_id !== '' && store_id !== 'null' && store_id !== '0') ? String(store_id) : null;

      const [result] = await db.query(
        'INSERT INTO users (username, password, role, store_id, email) VALUES (?, ?, ?, ?, ?)',
        [username, password, role || 'cashier', parsedStoreId, email || null]
      );

      return res.status(200).json({ success: true, userId: result.insertId });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (method === 'PUT') {
    const { id, username, password, role, store_id } = req.body;
    try {
      if (username && username.toLowerCase() === 'bendemen') {
        return res.status(403).json({ success: false, error: 'Het hoofdaccount bendemen kan niet worden aangepast.' });
      }

      const parsedStoreId = (store_id && store_id !== '' && store_id !== 'null' && store_id !== '0') ? String(store_id) : null;

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
      return res.status(500).json({ success: false, error: error.message });
    }
  }

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