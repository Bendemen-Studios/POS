import db from '../../../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, message: `Method ${req.method} Not Allowed` });
  }

  const userId = req.query.user_id || req.headers['x-user-id'];

  if (!userId) {
    return res.status(400).json({ success: false, message: 'Gebruikers ID ontbreekt.' });
  }

  try {
    // 1. Controleer rol van de gebruiker
    const [userRows] = await db.query(
      'SELECT id, username, role, store_id FROM users WHERE id = ?',
      [userId]
    );

    if (!Array.isArray(userRows) || userRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Gebruiker niet gevonden.' });
    }

    const user = userRows[0];
    const isAdmin =
      user.role === 'admin' ||
      user.role === 'super_admin' ||
      user.username?.toLowerCase() === 'bendemen';

    let stores = [];

    if (isAdmin) {
      // Admins zien alle actieve filialen
      const [allStores] = await db.query(
        'SELECT id, store_name, address, pickup_id, terminal_id FROM stores WHERE is_active = 1 OR is_active IS NULL'
      );
      stores = allStores;
    } else {
      // Reguliere gebruikers zien alleen filialen die via user_stores of hun store_id zijn gekoppeld
      const [userStoreRows] = await db.query(
        `SELECT s.id, s.store_name, s.address, s.pickup_id, s.terminal_id 
         FROM stores s
         LEFT JOIN user_stores us ON s.id = us.store_id
         WHERE (us.user_id = ? OR s.id = ?)
         AND (s.is_active = 1 OR s.is_active IS NULL)
         GROUP BY s.id`,
        [user.id, user.store_id || 0]
      );
      stores = userStoreRows;
    }

    return res.status(200).json({ success: true, stores });
  } catch (error) {
    console.error('[STORE SELECTION API ERROR]:', error);
    return res.status(500).json({ success: false, message: 'Fout bij ophalen van filialen.' });
  }
}