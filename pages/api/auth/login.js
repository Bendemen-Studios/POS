import pool from '../../../lib/db';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, message: `Method ${req.method} not allowed` });
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Vul zowel een gebruikersnaam als een wachtwoord in.' });
  }

  try {
    // Zoek de gebruiker in pos_users
    const [rows] = await pool.execute('SELECT * FROM pos_users WHERE username = ?', [username]);
    
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Ongeldige inloggegevens.' });
    }

    const user = rows[0];

    // Vergelijk het wachtwoord met password_hash
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Ongeldige inloggegevens.' });
    }

    // Forceer bendemen altijd naar super_admin
    const finalRole = (user.username === 'bendemen' || user.email === 'bendemenbv@gmail.com') 
      ? 'super_admin' 
      : (user.role || 'cashier');

    return res.status(200).json({
      success: true,
      token: `pos_session_${user.id}_${Date.now()}`,
      user: {
        id: user.id,
        username: user.username,
        email: user.email || '',
        role: finalRole
      }
    });

  } catch (error) {
    console.error("Login API Error:", error);
    return res.status(500).json({ success: false, message: 'Interne serverfout tijdens inloggen.' });
  }
}