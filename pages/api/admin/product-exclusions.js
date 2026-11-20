import db from '../../../lib/db';
import { requireSession } from '../../../lib/session';

const ensureTable = async () => db.query(`
  CREATE TABLE IF NOT EXISTS pos_catalog_exclusions (
    id TINYINT NOT NULL PRIMARY KEY,
    excluded_products LONGTEXT NOT NULL,
    excluded_categories LONGTEXT NOT NULL,
    category_rules LONGTEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )
`);
  try { await db.query('ALTER TABLE pos_catalog_exclusions ADD COLUMN category_rules LONGTEXT NULL'); } catch (_) {}

export default async function handler(req, res) {
  const session = await requireSession(req, res, { roles: ['admin', 'super_admin', 'administrator'] });
  if (!session) return;
  try {
    await ensureTable();
    if (req.method === 'GET') {
      const [rows] = await db.query('SELECT excluded_products, excluded_categories, category_rules FROM pos_catalog_exclusions WHERE id = 1');
      const row = rows[0] || {};
      const parse = value => { try { return JSON.parse(value || '[]'); } catch (_) { return []; } };
      let categoryRules = {}; try { categoryRules = JSON.parse(row.category_rules || '{}') || {}; } catch (_) {}
      return res.status(200).json({ success: true, excludedProducts: parse(row.excluded_products), excludedCategories: parse(row.excluded_categories), categoryRules });
    }
    if (req.method === 'PUT') {
      const products = [...new Set((Array.isArray(req.body?.excludedProducts) ? req.body.excludedProducts : []).map(Number).filter(id => Number.isInteger(id) && id > 0))];
      const categories = [...new Set((Array.isArray(req.body?.excludedCategories) ? req.body.excludedCategories : []).map(String).filter(Boolean))];
      const incomingRules = req.body?.categoryRules && typeof req.body.categoryRules === 'object' ? req.body.categoryRules : {};
      const categoryRules = {};
      for (const [id, rule] of Object.entries(incomingRules)) {
        if (!/^\d+$/.test(id) || !rule || typeof rule !== 'object') continue;
        categoryRules[id] = { excluded: rule.excluded === true, priority: Math.max(0, Math.min(999, Math.round(Number(rule.priority) || 0))) };
      }
      await db.query(`INSERT INTO pos_catalog_exclusions (id, excluded_products, excluded_categories, category_rules) VALUES (1, ?, ?, ?) ON DUPLICATE KEY UPDATE excluded_products = VALUES(excluded_products), excluded_categories = VALUES(excluded_categories), category_rules = VALUES(category_rules)`, [JSON.stringify(products), JSON.stringify(categories), JSON.stringify(categoryRules)]);
      return res.status(200).json({ success: true, excludedProducts: products, excludedCategories: categories, categoryRules });
    }
    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('[CATALOG EXCLUSIONS]', error.message);
    return res.status(500).json({ success: false, error: 'Uitsluitingen konden niet worden opgeslagen.' });
  }
}
