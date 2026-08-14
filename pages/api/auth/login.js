import pool from '../../../lib/db';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Gebruikersnaam en wachtwoord zijn verplicht.' });
  }

  try {
    const [users] = await pool.query('SELECT * FROM pos_users WHERE username = ?', [username]);

    if (users.length === 0) {
      return res.status(401).json({ success: false, error: 'Ongeldige inloggegevens.' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Ongeldige inloggegevens.' });
    }

    // Succesvolle login: retourneer de benodigde gegevens voor de frontend
    return res.status(200).json({
      success: true,
      token: `pos_token_${user.id}_${Date.now()}`,
      user: {
        id: user.id,
        username: user.username,
        name: user.name || user.username,
        role: user.role || 'cashier'
      },
      allowedStores: ['store_ons_winkeltje']
    });

  } catch (error) {
    console.error("Login API Error:", error.message);
    return res.status(500).json({ success: false, error: 'Interne serverfout bij inloggen.' });
  }
}