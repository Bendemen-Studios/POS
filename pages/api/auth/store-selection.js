import db from '../../../lib/db';
import { requireSession } from '../../../lib/session';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, message: `Method ${req.method} Not Allowed` });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const requestedUserId = req.query.user_id || req.headers['x-user-id'];
  if (requestedUserId && String(requestedUserId) !== String(session.id)) {
    return res.status(403).json({ success: false, message: 'Je kunt alleen filialen van je eigen account ophalen.' });
  }
  const userId = session.id;

  if (!userId) {
    return res.status(400).json({ success: false, message: 'Gebruikers ID ontbreekt.' });
  }

  const startedAt = Date.now();
  let userQueryMs = 0;
  let storesQueryMs = 0;

  try {
    // Always determine the allowed stores from the authenticated user's DB record.
    const userQueryStartedAt = Date.now();
    const [userRows] = await db.query(
      'SELECT id, username, role, store_id FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    userQueryMs = Date.now() - userQueryStartedAt;

    if (!Array.isArray(userRows) || userRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Gebruiker niet gevonden.' });
    }

    const user = userRows[0];
    const isAdmin =
      ['admin', 'super_admin', 'administrator'].includes(String(session.role || '').toLowerCase()) ||
      user.username?.toLowerCase() === 'bendemen';

    let stores = [];
    const storesQueryStartedAt = Date.now();

    if (isAdmin) {
      // Administrators may select any active store.
      const [allStores] = await db.query(
        'SELECT id, store_name, address, pickup_id, terminal_id, payment_methods FROM stores ORDER BY store_name ASC'
      );
      stores = allStores;
    } else {
      // Regular users may ONLY see the store(s) explicitly assigned to their account.
      // Never fall back to all stores: an empty/invalid assignment means no stores.
      const assignedStoreId = user.store_id == null ? '' : String(user.store_id).trim();

      if (assignedStoreId) {
        const assignedIds = assignedStoreId
          .split(',')
          .map(id => id.trim())
          .filter(Boolean);

        if (assignedIds.length > 0) {
          const placeholders = assignedIds.map(() => '?').join(',');
          const [assignedStores] = await db.query(
            `SELECT id, store_name, address, pickup_id, terminal_id, payment_methods
             FROM stores
             WHERE CAST(id AS CHAR) IN (${placeholders})
             ORDER BY store_name ASC`,
            assignedIds
          );
          stores = assignedStores;
        }
      }
    }

    storesQueryMs = Date.now() - storesQueryStartedAt;
    const totalMs = Date.now() - startedAt;
    res.setHeader('Server-Timing', `user-query;dur=${userQueryMs}, stores-query;dur=${storesQueryMs}, total;dur=${totalMs}`);
    console.info('[STORE SELECTION PERF]', JSON.stringify({ userQueryMs, storesQueryMs, totalMs }));
    return res.status(200).json({ success: true, stores });
  } catch (error) {
    const totalMs = Date.now() - startedAt;
    res.setHeader('Server-Timing', `user-query;dur=${userQueryMs}, stores-query;dur=${storesQueryMs}, total;dur=${totalMs}`);
    console.info('[STORE SELECTION PERF]', JSON.stringify({ userQueryMs, storesQueryMs, totalMs, failed: true }));
    console.error('[STORE SELECTION API ERROR]:', error);
    return res.status(500).json({ success: false, message: 'Fout bij ophalen van filialen uit de database.' });
  }
}
