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
    // 1. Haal de gebruiker op uit de DB
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
      // Admins zien alle filialen
      const [allStores] = await db.query(
        'SELECT id, store_name, address, pickup_id, terminal_id FROM stores'
      );
      stores = allStores;
    } else {
      // Reguliere gebruikers: zoek op hun store_id / id / store_name
      const userStoreId = user.store_id || '';

      const [userStoreRows] = await db.query(
        `SELECT id, store_name, address, pickup_id, terminal_id 
         FROM stores 
         WHERE id = ? OR store_name = ?`,
        [userStoreId, userStoreId]
      );

      // Fallback: Als er geen specifieke match is, haal alle filialen op
      if (userStoreRows.length === 0) {
        const [fallbackStores] = await db.query(
          'SELECT id, store_name, address, pickup_id, terminal_id FROM stores'
        );
        stores = fallbackStores;
      } else {
        stores = userStoreRows;
      }
    }

    return res.status(200).json({ success: true, stores });
  } catch (error) {
    console.error('[STORE SELECTION API ERROR]:', error);
    return res.status(500).json({ success: false, message: 'Fout bij ophalen van filialen uit de database.' });
  }
}