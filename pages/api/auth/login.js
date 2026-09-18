import db, { dbReady } from '../../../lib/db';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, message: `Method ${req.method} Not Allowed` });
  }

  const { username, password } = req.body || {};
  const cleanUsername = String(username || '').trim().toLowerCase();

  if (!cleanUsername || !password) {
    return res.status(400).json({ success: false, message: 'Vul zowel een gebruikersnaam als een wachtwoord in.' });
  }

  try {
    // Wait for first-start schema creation/migrations before querying users.
    await dbReady;

    // Use username as the canonical login identifier. This deliberately does
    // not reference optional legacy columns such as `email`, so an old POS
    // database can still authenticate while its schema is being migrated.
    const [rows] = await db.query(
      'SELECT id, username, email, password, password_hash, role, store_id, name FROM users WHERE username = ? LIMIT 1',
      [cleanUsername]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(`[LOGIN FAILED] Gebruiker niet gevonden in DB: "${cleanUsername}"`);
      return res.status(401).json({ success: false, message: 'Ongeldige inloggegevens.' });
    }

    const user = rows[0];
    const storedPassword = user.password || user.password_hash || '';

    if (!storedPassword) {
      console.error(`[LOGIN ERROR] Geen wachtwoord gevonden in DB voor gebruiker: ${cleanUsername}`);
      return res.status(500).json({ success: false, message: 'Fout in gebruikersprofiel (geen wachtwoord).' });
    }

    const isBcrypt = /^\$2[aby]\$/.test(storedPassword);
    let isMatch = false;

    if (isBcrypt) {
      isMatch = await bcrypt.compare(password, storedPassword);
    } else {
      isMatch = password === storedPassword;
      if (isMatch && user.id != null) {
        bcrypt.hash(password, 10).then(newHash => {
          const column = user.password_hash ? 'password_hash' : 'password';
          db.query(`UPDATE users SET ${column} = ? WHERE id = ?`, [newHash, user.id]).catch(err => {
            console.error('Fout bij automatisch omzetten naar bcrypt hash:', err);
          });
        }).catch(err => console.error('Fout bij bcrypt hash:', err));
      }
    }

    if (!isMatch) {
      console.log(`[LOGIN FAILED] Wachtwoord komt niet overeen voor gebruiker: "${cleanUsername}"`);
      return res.status(401).json({ success: false, message: 'Ongeldige inloggegevens.' });
    }

    const isMainOwner = user.username?.toLowerCase() === 'bendemen' || user.email?.toLowerCase() === 'bendemenbv@gmail.com';

    const effectiveRole = isMainOwner ? 'super_admin' : (user.role || 'cashier');
    let stores = [];
    if (isMainOwner || ['admin', 'super_admin', 'administrator'].includes(String(effectiveRole).toLowerCase())) {
      const [storeRows] = await db.query('SELECT id, store_name, address, pickup_id, terminal_id, payment_methods FROM stores ORDER BY store_name ASC');
      stores = Array.isArray(storeRows) ? storeRows : [];
    } else if (user.store_id != null && String(user.store_id).trim()) {
      const assignedIds = String(user.store_id).split(',').map(id => id.trim()).filter(Boolean);
      if (assignedIds.length) {
        const placeholders = assignedIds.map(() => '?').join(',');
        const [storeRows] = await db.query(`SELECT id, store_name, address, pickup_id, terminal_id, payment_methods FROM stores WHERE id IN (${placeholders}) ORDER BY store_name ASC`, assignedIds);
        stores = Array.isArray(storeRows) ? storeRows : [];
      }
    }

    console.log(`[LOGIN SUCCESS] Gebruiker ingelogd: ${user.username}`);

    return res.status(200).json({
      success: true,
      token: `pos_session_${user.id}_${Date.now()}`,
      user: {
        id: user.id,
        username: user.username,
        email: user.email || '',
        role: effectiveRole,
        store_id: user.store_id || null,
        store_name: 'Geen Filiaal'
      },
      stores
    });
  } catch (error) {
    console.error('[LOGIN API EXCEPTION]:', error);
    return res.status(500).json({ success: false, message: 'Interne serverfout bij inloggen.' });
  }
}
