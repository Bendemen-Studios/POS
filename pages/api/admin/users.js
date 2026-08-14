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

  // Hulpfunctie om store_id veilig af te handelen (ondersteunt zowel nummers als tekst-slugs)
  const resolveStoreId = async (storeIdVal) => {
    if (storeIdVal === undefined || storeIdVal === null || storeIdVal === '') {
      return null;
    }
    
    // Als het al een getal is (of als getal geschreven string)
    if (!isNaN(storeIdVal)) {
      return parseInt(storeIdVal, 10);
    }

    // Als het een tekst-slug is (zoals 'store_ons_winkeltje'), zoek het ID op in pos_stores
    try {
      const [stores] = await pool.execute(
        'SELECT id FROM pos_stores WHERE store_name = ? OR name = ? LIMIT 1',
        [storeIdVal, storeIdVal]
      );
      if (stores.length > 0) {
        return stores[0].id;
      }
    } catch (e) {
      console.error("Store resolution error:", e);
    }

    return null;
  };

  // POST: Nieuwe gebruiker aanmaken
  if (req.method === 'POST') {
    try {
      const { username, password, role, store_id, email } = req.body;

      if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Gebruikersnaam en wachtwoord zijn verplicht.' });
      }

      const assignedRole = role || 'cashier';
      const assignedStoreId = await resolveStoreId(store_id);
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

  // PUT: Bestaande gebruiker bewerken (behalve bendemen)
  if (req.method === 'PUT') {
    try {
      const { id, password, role, store_id, email } = req.body;
      if (!id) return res.status(400).json({ success: false, message: 'Geen ID opgegeven.' });

      const [users] = await pool.execute('SELECT username FROM pos_users WHERE id = ?', [id]);
      if (users.length === 0) return res.status(404).json({ success: false, message: 'Gebruiker niet gevonden.' });

      if (users[0].username.toLowerCase() === 'bendemen') {
        return res.status(403).json({ success: false, message: 'Het hoofdaccount bendemen kan niet worden bewerkt.' });
      }

      const assignedRole = role || 'cashier';
      const assignedStoreId = await resolveStoreId(store_id);
      const userEmail = email || null;

      if (password && password.trim() !== '') {
        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.execute(
          `UPDATE pos_users SET password_hash = ?, email = ?, role = ?, store_id = ? WHERE id = ?`,
          [hashedPassword, userEmail, assignedRole, assignedStoreId, id]
        );
      } else {
        await pool.execute(
          `UPDATE pos_users SET email = ?, role = ?, store_id = ? WHERE id = ?`,
          [userEmail, assignedRole, assignedStoreId, id]
        );
      }

      return res.status(200).json({ success: true, message: 'Gebruiker bijgewerkt!' });
    } catch (error) {
      console.error("Users PUT Error:", error);
      return res.status(500).json({ success: false, error: 'Fout bij bijwerken gebruiker: ' + error.message });
    }
  }

  // DELETE: Verwijder gebruiker (behalve bendemen)
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