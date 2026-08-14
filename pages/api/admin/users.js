import pool from '../../../lib/db';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  // GET: Haal alle gebruikers op uit pos_users
  if (req.method === 'GET') {
    try {
      const [users] = await pool.execute('SELECT id, username, email, role, store_id FROM pos_users');

      const formattedUsers = users.map(user => ({
        ...user,
        role: (user.username === 'bendemen' || user.email === 'bendemenbv@gmail.com') 
          ? 'super_admin' 
          : (user.role || 'cashier')
      }));

      return res.status(200).json({ success: true, users: formattedUsers });
    } catch (error) {
      console.error("Fetch users error:", error);
      return res.status(500).json({ success: false, error: 'Fout bij ophalen gebruikers' });
    }
  }

  // POST: Nieuwe gebruiker aanmaken met gekoppelde store_id
  if (req.method === 'POST') {
    try {
      const { username, password, role, store_id, email } = req.body;

      if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Gebruikersnaam en wachtwoord verplicht.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      await pool.execute(
        'INSERT INTO pos_users (username, password_hash, email, role, store_id) VALUES (?, ?, ?, ?, ?)',
        [username, hashedPassword, email || '', role || 'cashier', store_id || null]
      );

      return res.status(200).json({ success: true, message: 'Gebruiker succesvol aangemaakt!' });
    } catch (error) {
      console.error("Create user error:", error);
      return res.status(500).json({ success: false, message: 'Fout bij aanmaken van gebruiker.' });
    }
  }

  // DELETE: Gebruiker verwijderen uit pos_users
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).json({ success: false, message: 'Geen ID opgegeven.' });

      await pool.execute('DELETE FROM pos_users WHERE id = ?', [id]);
      return res.status(200).json({ success: true, message: 'Gebruiker succesvol verwijderd.' });
    } catch (error) {
      console.error("Delete user error:", error);
      return res.status(500).json({ success: false, message: 'Fout bij verwijderen van gebruiker.' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).json({ success: false, message: `Method ${req.method} not allowed` });
}