import db from '../../../lib/db';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  const { method } = req;

  // Zorg dat de store_id kolom VARCHAR accepteert voor string-ID's
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
          COALESCE(s.store_name, 'Geen') AS store_name 
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
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Gebruikersnaam en wachtwoord zijn verplicht.' });
    }

    try {
      const parsedStoreId = (store_id && store_id !== '' && store_id !== 'null' && store_id !== '0') ? String(store_id) : null;

      // Hash het wachtwoord met bcrypt (10 salt rounds)
      const hashedPassword = await bcrypt.hash(password, 10);

      const [result] = await db.query(
        'INSERT INTO users (username, password, role, store_id, email) VALUES (?, ?, ?, ?, ?)',
        [username, hashedPassword, role || 'cashier', parsedStoreId, email || null]
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
        // Hash het nieuwe wachtwoord als dit is ingevuld
        const hashedPassword = await bcrypt.hash(password, 10);

        await db.query(
          'UPDATE users SET username = ?, password = ?, role = ?, store_id = ? WHERE id = ?',
          [username, hashedPassword, role, parsedStoreId, id]
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