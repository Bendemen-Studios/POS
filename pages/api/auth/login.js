import db from '../../../lib/db';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, message: `Method ${req.method} Not Allowed` });
  }

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Vul zowel een gebruikersnaam als een wachtwoord in.' });
  }

  try {
    // Alleen de velden die de POS-login nodig heeft ophalen. Dit voorkomt een
    // onnodig grote users-row en scheelt een extra stores-query per login.
    const [rows] = await db.query(
      'SELECT id, username, email, role, store_id, store_name, password, password_hash FROM users WHERE username = ? OR email = ? LIMIT 1',
      [username, username]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(`[LOGIN FAILED] Gebruiker niet gevonden in DB: "${username}"`);
      return res.status(401).json({ success: false, message: 'Ongeldige inloggegevens.' });
    }

    const user = rows[0];
    const storedPassword = user.password || user.password_hash || '';
    if (!storedPassword) {
      console.error(`[LOGIN ERROR] Geen wachtwoord gevonden in DB voor gebruiker: ${username}`);
      return res.status(500).json({ success: false, message: 'Fout in gebruikersprofiel (geen wachtwoord).' });
    }

    const isBcrypt = storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$') || storedPassword.startsWith('$2y$');
    let isMatch = false;

    if (isBcrypt) {
      isMatch = await bcrypt.compare(password, storedPassword);
    } else {
      isMatch = password === storedPassword;
      if (isMatch) {
        // Security upgrade mag de succesvolle login niet onnodig blokkeren.
        bcrypt.hash(password, 10).then(newHash => {
          db.query('UPDATE users SET password = ? WHERE id = ?', [newHash, user.id]).catch(err => {
            console.error('Fout bij automatisch omzetten naar bcrypt hash:', err);
          });
        }).catch(err => console.error('Fout bij bcrypt hash:', err));
      }
    }

    if (!isMatch) {
      console.log(`[LOGIN FAILED] Wachtwoord komt niet overeen voor gebruiker: "${username}"`);
      return res.status(401).json({ success: false, message: 'Ongeldige inloggegevens.' });
    }

    const isMainOwner = user.username?.toLowerCase() === 'bendemen' || user.email === 'bendemenbv@gmail.com';

    console.log(`[LOGIN SUCCESS] Gebruiker ingelogd: ${user.username}`);

    return res.status(200).json({
      success: true,
      token: `pos_session_${user.id}_${Date.now()}`,
      user: {
        id: user.id,
        username: user.username,
        email: user.email || '',
        role: isMainOwner ? 'super_admin' : (user.role || 'cashier'),
        store_id: user.store_id || null,
        store_name: user.store_name || 'Geen Filiaal'
      }
    });
  } catch (error) {
    console.error('[LOGIN API EXCEPTION]:', error);
    return res.status(500).json({ success: false, message: 'Interne serverfout bij inloggen.' });
  }
}