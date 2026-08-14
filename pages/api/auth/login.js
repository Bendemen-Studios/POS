import pool from '../../../lib/db';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Gebruikersnaam en wachtwoord zijn verplicht.' });
  }

  try {
    const [users] = await pool.query('SELECT * FROM pos_users WHERE username = ?', [username]);

    if (users.length > 0) {
      const user = users[0];
      const isMatch = await bcrypt.compare(password, user.password_hash);

      if (isMatch) {
        return res.status(200).json({
          success: true,
          user: { id: user.id, username: user.username, name: user.name, role: user.role }
        });
      }
    }
    return res.status(401).json({ success: false, message: 'Ongeldige inloggegevens.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Database fout bij inloggen.' });
  }
}