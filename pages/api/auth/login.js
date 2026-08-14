import pool from '../../../lib/db';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { username, password } = req.body;

  try {
    const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) return res.status(401).json({ success: false, message: 'Gebruiker niet gevonden' });

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) return res.status(401).json({ success: false, message: 'Wachtwoord onjuist' });

    // Forceer bendemen naar super_admin
    const finalRole = (user.username === 'bendemen' || user.email === 'bendemenbv@gmail.com') 
      ? 'super_admin' 
      : (user.role || 'cashier');

    res.status(200).json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: finalRole
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server fout' });
  }
}