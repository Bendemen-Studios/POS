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
    const [rows] = await pool.query(
      `SELECT 
        u.*, 
        COALESCE(s.store_name, 'Geen Filiaal') AS store_name 
       FROM users u 
       LEFT JOIN stores s ON CAST(u.store_id AS CHAR) = CAST(s.id AS CHAR) 
       WHERE u.username = ? OR u.email = ?`,
      [username, username]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Ongeldige inloggegevens.' });
    }

    const user = rows[0];
    const storedPassword = user.password || user.password_hash || '';

    // Controleer of het opgeslagen wachtwoord een bcrypt hash is (begint met $2a$ of $2b$)
    const isBcryptHash = storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$');
    let isMatch = false;

    if (isBcryptHash) {
      isMatch = await bcrypt.compare(password, storedPassword);
    } else {
      // Vergelijk tijdelijk met platte tekst
      isMatch = password === storedPassword;

      // Automatische migratie: zet het platte tekst wachtwoord meteen om naar een bcrypt hash in de DB
      if (isMatch) {
        try {
          const newHash = await bcrypt.hash(password, 10);
          await pool.query('UPDATE users SET password = ? WHERE id = ?', [newHash, user.id]);
        } catch (migErr) {
          console.error('Fout bij automatisch upgraden naar bcrypt hash:', migErr);
        }
      }
    }

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Ongeldige inloggegevens.' });
    }

    const isMainOwnerAccount = user.username?.toLowerCase() === 'bendemen' || user.email === 'bendemenbv@gmail.com' || user.email === 'info@bendemen.nl';

    const effectiveRole = isMainOwnerAccount 
      ? 'super_admin' 
      : (user.role || 'cashier');

    return res.status(200).json({
      success: true,
      token: `pos_session_${user.id}_${Date.now()}`,
      user: {
        id: user.id,
        username: user.username,
        email: user.email || '',
        role: effectiveRole,
        store_id: user.store_id || null,
        store_name: user.store_name || 'Geen Filiaal'
      }
    });

  } catch (error) {
    console.error("Login API Error:", error);
    return res.status(500).json({ success: false, message: 'Interne serverfout tijdens inloggen.' });
  }
}