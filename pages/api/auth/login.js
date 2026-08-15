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
    // Zoek gebruiker op gebruikersnaam of email
    const [rows] = await db.query(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, username]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(`[LOGIN FAILED] Gebruiker niet gevonden in DB: "${username}"`);
      return res.status(401).json({ success: false, message: 'Ongeldige inloggegevens.' });
    }

    const user = rows[0];

    // Bepaal opgeslagen wachtwoord (ondersteunt 'password' én 'password_hash')
    const storedPassword = user.password || user.password_hash || '';

    if (!storedPassword) {
      console.error(`[LOGIN ERROR] Geen wachtwoord gevonden in DB voor gebruiker: ${username}`);
      return res.status(500).json({ success: false, message: 'Fout in gebruikersprofiel (geen wachtwoord).' });
    }

    // Controleer of het opgeslagen wachtwoord al een bcrypt hash is (begint met $2a$ of $2b$)
    const isBcrypt = storedPassword.startsWith('$2a$') || storedPassword.startsWith('$2b$');
    let isMatch = false;

    if (isBcrypt) {
      // Wachtwoord is al gehashed -> vergelijk via bcrypt
      isMatch = await bcrypt.compare(password, storedPassword);
    } else {
      // Wachtwoord is nog een gewoon wachtwoord -> vergelijk direct
      isMatch = password === storedPassword;

      // AUTOMATISCHE HASHING: Als het gewone wachtwoord klopt, direct omzetten naar bcrypt hash in DB
      if (isMatch) {
        try {
          const newHash = await bcrypt.hash(password, 10);
          await db.query('UPDATE users SET password = ? WHERE id = ?', [newHash, user.id]);
          console.log(`[SECURITY UPGRADE] Gewoon wachtwoord voor gebruiker "${user.username}" succesvol gehashed naar bcrypt!`);
        } catch (hashErr) {
          console.error('Fout bij automatisch omzetten naar bcrypt hash:', hashErr);
        }
      }
    }

    if (!isMatch) {
      console.log(`[LOGIN FAILED] Wachtwoord komt niet overeen voor gebruiker: "${username}"`);
      return res.status(401).json({ success: false, message: 'Ongeldige inloggegevens.' });
    }

    // Haal eventueel gekoppelde winkelnaam op
    let storeName = 'Geen Filiaal';
    if (user.store_id) {
      try {
        const [storeRows] = await db.query('SELECT store_name FROM stores WHERE id = ?', [user.store_id]);
        if (Array.isArray(storeRows) && storeRows.length > 0) {
          storeName = storeRows[0].store_name;
        }
      } catch (sErr) {
        console.error('Fout bij ophalen winkelnaam:', sErr.message);
      }
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
        store_name: storeName
      }
    });

  } catch (error) {
    console.error('[LOGIN API EXCEPTION]:', error);
    return res.status(500).json({ success: false, message: 'Interne serverfout bij inloggen.' });
  }
}