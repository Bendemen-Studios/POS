import db, { ensureDatabaseReady } from '../../../lib/db';
import { createSessionToken } from '../../../lib/session';
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

  const startedAt = Date.now();
  const timings = { userQueryMs: 0, passwordCheckMs: 0, storesQueryMs: 0 };

  try {
    // Fast path: query the existing schema directly. Full schema migrations are
    // only needed for a fresh/legacy database, not for every cold login.
    const queryUser = () => db.query(
      'SELECT id, username, email, password, password_hash, role, store_id, name FROM users WHERE username = ? LIMIT 1',
      [cleanUsername]
    );

    let rows;
    const userQueryStartedAt = Date.now();
    try {
      try {
        [rows] = await queryUser();
      } catch (error) {
        if (!['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(error?.code)) throw error;
        await ensureDatabaseReady();
        [rows] = await queryUser();
      }
    } finally {
      timings.userQueryMs = Date.now() - userQueryStartedAt;
    }

    if (!Array.isArray(rows) || rows.length === 0) {
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

    const passwordCheckStartedAt = Date.now();
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

    timings.passwordCheckMs = Date.now() - passwordCheckStartedAt;

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Ongeldige inloggegevens.' });
    }

    const isMainOwner = user.username?.toLowerCase() === 'bendemen' || user.email?.toLowerCase() === 'bendemenbv@gmail.com';
    const effectiveRole = isMainOwner ? 'super_admin' : (user.role || 'cashier');
    let stores = [];
    const storesQueryStartedAt = Date.now();

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

    timings.storesQueryMs = Date.now() - storesQueryStartedAt;
    const totalMs = Date.now() - startedAt;
    res.setHeader('Server-Timing', `user-query;dur=${timings.userQueryMs}, password-check;dur=${timings.passwordCheckMs}, stores-query;dur=${timings.storesQueryMs}, total;dur=${totalMs}`);
    console.info('[LOGIN PERF]', JSON.stringify({ ...timings, totalMs }));

    return res.status(200).json({
      success: true,
      token: createSessionToken(user.id),
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
    const totalMs = Date.now() - startedAt;
    res.setHeader('Server-Timing', `user-query;dur=${timings.userQueryMs}, password-check;dur=${timings.passwordCheckMs}, stores-query;dur=${timings.storesQueryMs}, total;dur=${totalMs}`);
    console.info('[LOGIN PERF]', JSON.stringify({ ...timings, totalMs, failed: true }));
    console.error('[LOGIN API EXCEPTION]:', error);
    return res.status(500).json({ success: false, message: 'Interne serverfout bij inloggen.' });
  }
}
