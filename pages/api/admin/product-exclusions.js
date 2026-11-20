import db from '../../../lib/db';
import { requireSession } from '../../../lib/session';

const ensureTable = async () => db.query(`
  CREATE TABLE IF NOT EXISTS pos_catalog_exclusions (
    id TINYINT NOT NULL PRIMARY KEY,
    excluded_products LONGTEXT NOT NULL,
    excluded_categories LONGTEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )
`);

export default async function handler(req, res) {
  const session = await requireSession(req, res, { roles: ['admin', 'super_admin', 'administrator'] });
  if (!session) return;
  try {
    await ensureTable();
    if (req.method === 'GET') {
      const [rows] = await db.query('SELECT excluded_products, excluded_categories FROM pos_catalog_exclusions WHERE id = 1');
      const row = rows[0] || {};
      const parse = value => { try { return JSON.parse(value || '[]'); } catch (_) { return []; } };
      return res.status(200).json({ success: true, excludedProducts: parse(row.excluded_products), excludedCategories: parse(row.excluded_categories) });
    }
    if (req.method === 'PUT') {
      const products = [...new Set((Array.isArray(req.body?.excludedProducts) ? req.body.excludedProducts : []).map(Number).filter(id => Number.isInteger(id) && id > 0))];
      const categories = [...new Set((Array.isArray(req.body?.excludedCategories) ? req.body.excludedCategories : []).map(String).filter(Boolean))];
      await db.query(`INSERT INTO pos_catalog_exclusions (id, excluded_products, excluded_categories) VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE excluded_products = VALUES(excluded_products), excluded_categories = VALUES(excluded_categories)`, [JSON.stringify(products), JSON.stringify(categories)]);
      return res.status(200).json({ success: true, excludedProducts: products, excludedCategories: categories });
    }
    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('[CATALOG EXCLUSIONS]', error.message);
    return res.status(500).json({ success: false, error: 'Uitsluitingen konden niet worden opgeslagen.' });
  }
}
