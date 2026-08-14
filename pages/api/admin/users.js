import pool from '../../../lib/db';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      // Vang eventuele database kolomfouten op met een schone fallback
      const [users] = await pool.execute('SELECT * FROM pos_users');

      const formattedUsers = users.map(user => {
        const isMainOwner = user.username === 'bendemen' || user.email === 'info@bendemen.nl';

        return {
          id: user.id,
          username: user.username,
          email: isMainOwner ? 'info@bendemen.nl' : (user.email || 'info@bendemen.nl'),
          role: isMainOwner ? 'super_admin' : (user.role || 'cashier'),
          store_id: user.store_id || null
        };
      });

      return res.status(200).json({ success: true, users: formattedUsers });
    } catch (error) {
      console.error("Fetch users error:", error);
      return res.status(500).json({ success: false, error: 'Databasefout bij ophalen gebruikers.' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { username, password, role, store_id, email } = req.body;

      if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Gebruikersnaam en wachtwoord verplicht.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      await pool.execute(
        'INSERT INTO pos_users (username, password_hash, email, role, store_id) VALUES (?, ?, ?, ?, ?)',
        [username, hashedPassword, email || 'info@bendemen.nl', role || 'cashier', store_id || null]
      );

      return res.status(200).json({ success: true, message: 'Gebruiker aangemaakt!' });
    } catch (error) {
      console.error("Create user error:", error);
      return res.status(500).json({ success: false, message: 'Fout bij aanmaken gebruiker.' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, message: 'Geen ID opgegeven.' });

      const [targetRows] = await pool.execute('SELECT username, email FROM pos_users WHERE id = ?', [id]);
      
      if (targetRows.length > 0) {
        const targetUser = targetRows[0];
        const isMainOwner = targetUser.username === 'bendemen' || targetUser.email === 'info@bendemen.nl';

        if (isMainOwner) {
          return res.status(403).json({ 
            success: false, 
            message: 'Het hoofdaccount "bendemen" is beveiligd en kan niet worden verwijderd.' 
          });
        }
      }

      await pool.execute('DELETE FROM pos_users WHERE id = ?', [id]);
      return res.status(200).json({ success: true, message: 'Gebruiker verwijderd.' });
    } catch (error) {
      console.error("Delete user error:", error);
      return res.status(500).json({ success: false, message: 'Fout bij verwijderen gebruiker.' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).json({ success: false, message: `Method ${req.method} not allowed` });
}