import db from '../../../lib/db';

export default async function handler(req, res) {
  const { method } = req;

  if (method === 'GET') {
    try {
      const [rows] = await db.query('SELECT id, username, role, store_id, email FROM users');
      
      // Zorg ervoor dat er altijd een nette array van gebruikers wordt geretourneerd
      const usersList = Array.isArray(rows) ? rows : [];
      
      return res.status(200).json({ success: true, users: usersList });
    } catch (error) {
      console.error('Fout bij ophalen gebruikers:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  if (method === 'POST') {
    const { username, password, role, store_id, email } = req.body;
    try {
      const parsedStoreId = store_id !== null && store_id !== undefined && store_id !== '' && store_id !== 'null' ? Number(store_id) : null;
      
      console.log(`Creating user: username=${username}, role=${role}, store_id=${parsedStoreId}`);

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

      const parsedStoreId = store_id !== null && store_id !== undefined && store_id !== '' && store_id !== 'null' ? Number(store_id) : null;

      console.log(`Updating user ID ${id}: role=${role}, store_id=${parsedStoreId}`);

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