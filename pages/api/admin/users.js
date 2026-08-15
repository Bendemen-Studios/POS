import pool from '../../../lib/db';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  // GET: Haal alle gebruikers op
  if (req.method === 'GET') {
    try {
      const [rows] = await pool.execute('SELECT id, username, email, role, store_id FROM pos_users ORDER BY id ASC');
      return res.status(200).json({ success: true, users: rows });
    } catch (error) {
      console.error("Users GET Error:", error);
      return res.status(500).json({ success: false, error: 'Fout bij ophalen gebruikers.' });
    }
  }

  // Hulpfunctie om store_id veilig te parsen
  const parseStoreId = (val) => {
    if (val === undefined || val === null || val === '' || val === 'null') {
      return null;
    }
    const num = Number(val);
    return isNaN(num) ? null : num;
  };

  // POST: Nieuwe gebruiker aanmaken
  if (req.method === 'POST') {
    try {
      const { username, password, role, store_id, email } = req.body;

      if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Gebruikersnaam en wachtwoord zijn verplicht.' });
      }

      const assignedRole = role || 'cashier';
      const assignedStoreId = parseStoreId(store_id);
      const userEmail = email || null;
      const hashedPassword = await bcrypt.hash(password, 10);

      await pool.execute(
        `INSERT INTO pos_users (username, password_hash, email, role, store_id) VALUES (?, ?, ?, ?, ?)`,
        [username.trim(), hashedPassword, userEmail, assignedRole, assignedStoreId]
      );

      return res.status(200).json({ success: true, message: 'Medewerker succesvol aangemaakt!' });
    } catch (error) {
      console.error("Users POST Error:", error);
      return res.status(500).json({ success: false, error: 'Fout bij aanmaken medewerker: ' + error.message });
    }
  }

  // PUT: Bestaande gebruiker bewerken
  if (req.method === 'PUT') {
    try {
      const { id, username, password, role, store_id, email } = req.body;
      if (!id) return res.status(400).json({ success: false, message: 'Geen ID opgegeven.' });

      const [users] = await pool.execute('SELECT username FROM pos_users WHERE id = ?', [id]);
      if (users.length === 0) return res.status(404).json({ success: false, message: 'Gebruiker niet gevonden.' });

      const currentDbUsername = users[0].username;
      const finalUsername = (currentDbUsername.toLowerCase() === 'bendemen') ? 'bendemen' : (username ? username.trim() : currentDbUsername);
      const assignedRole = role || 'cashier';
      const assignedStoreId = parseStoreId(store_id);
      const userEmail = email || null;

      console.log(`Updating user ID ${id}: role=${assignedRole}, store_id=${assignedStoreId}`);

      if (password && password.trim() !== '') {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.execute(
          `UPDATE pos_users SET username = ?, password_hash = ?, email = ?, role = ?, store_id = ? WHERE id = ?`,
          [finalUsername, hashedPassword, userEmail, assignedRole, assignedStoreId, id]
        );
      } else {
        await pool.execute(
          `UPDATE pos_users SET username = ?, email = ?, role = ?, store_id = ? WHERE id = ?`,
          [finalUsername, userEmail, assignedRole, assignedStoreId, id]
        );
      }

      return res.status(200).json({ success: true, message: 'Gebruiker bijgewerkt!' });
    } catch (error) {
      console.error("Users PUT Error:", error);
      return res.status(500).json({ success: false, error: 'Fout bij bijwerken gebruiker: ' + error.message });
    }
  }

  // DELETE: Verwijder gebruiker
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, message: 'Geen ID opgegeven.' });

      const [users] = await pool.execute('SELECT username FROM pos_users WHERE id = ?', [id]);
      if (users.length === 0) return res.status(404).json({ success: false, message: 'Gebruiker niet gevonden.' });

      if (users[0].username.toLowerCase() === 'bendemen') {
        return res.status(403).json({ success: false, message: 'Het hoofdaccount bendemen kan niet worden verwijderd.' });
      }

      await pool.execute('DELETE FROM pos_users WHERE id = ?', [id]);
      return res.status(200).json({ success: true, message: 'Gebruiker succesvol verwijderd.' });
    } catch (error) {
      console.error("Users DELETE Error:", error);
      return res.status(500).json({ success: false, error: 'Fout bij verwijderen gebruiker.' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
  return res.status(405).json({ success: false, message: `Method ${req.method} not allowed` });
}