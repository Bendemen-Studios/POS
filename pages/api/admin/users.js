import pool from '../../../lib/db';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  try {
    // GET: Ophalen van alle gebruikers
    if (req.method === 'GET') {
      const [users] = await pool.query('SELECT id, username, name, role FROM pos_users');
      return res.status(200).json({ success: true, users });
    }

    // POST: Nieuwe gebruiker aanmaken (standaard rol is cashier)
    if (req.method === 'POST') {
      const { username, password, name, role } = req.body;
      if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Gebruikersnaam en wachtwoord verplicht.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const assignedRole = role && ['cashier', 'manager', 'administrator'].includes(role) ? role : 'cashier';

      await pool.query(
        'INSERT INTO pos_users (username, password_hash, name, role) VALUES (?, ?, ?, ?)',
        [username, hashedPassword, name || username, assignedRole]
      );
      return res.status(200).json({ success: true, message: 'Gebruiker succesvol aangemaakt.' });
    }

    // DELETE: Gebruiker verwijderen (blokkeert verwijdering van 'bendemen')
    if (req.method === 'DELETE') {
      const { id, username } = req.body;

      // Controleer op basis van ID of Username of het om de super admin gaat
      let targetUsername = username;
      if (id && !targetUsername) {
        const [rows] = await pool.query('SELECT username FROM pos_users WHERE id = ?', [id]);
        if (rows.length > 0) targetUsername = rows[0].username;
      }

      if (targetUsername === 'bendemen') {
        return res.status(403).json({ success: false, message: 'De hoofdadministrator (bendemen) kan niet worden verwijderd!' });
      }

      if (id) {
        await pool.query('DELETE FROM pos_users WHERE id = ?', [id]);
      } else if (username) {
        await pool.query('DELETE FROM pos_users WHERE username = ?', [username]);
      }

      return res.status(200).json({ success: true, message: 'Gebruiker verwijderd.' });
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}