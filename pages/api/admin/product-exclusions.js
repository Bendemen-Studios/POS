import db from '../../../lib/db';
import { requireSession } from '../../../lib/session';

const ensureTables = async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS pos_catalog_exclusions (
    id TINYINT NOT NULL PRIMARY KEY,
    excluded_products LONGTEXT NOT NULL,
    excluded_categories LONGTEXT NOT NULL,
    category_rules LONGTEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  try { await db.query('ALTER TABLE pos_catalog_exclusions ADD COLUMN category_rules LONGTEXT NULL'); } catch (_) {}
  await db.query(`CREATE TABLE IF NOT EXISTS pos_store_catalog_exclusions (
    store_id VARCHAR(191) NOT NULL PRIMARY KEY,
    excluded_products LONGTEXT NOT NULL,
    category_rules LONGTEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
};
const parse = (value, fallback) => { try { return JSON.parse(value || JSON.stringify(fallback)); } catch (_) { return fallback; } };
const normalizeRules = incoming => {
  const rules = {};
  for (const [id, rule] of Object.entries(incoming && typeof incoming === 'object' ? incoming : {})) {
    if (!/^\d+$/.test(id) || !rule || typeof rule !== 'object') continue;
    rules[id] = { excluded: rule.excluded === true, priority: Math.max(0, Math.min(999, Math.round(Number(rule.priority) || 0))) };
  }
  return rules;
};

export default async function handler(req, res) {
  const session = await requireSession(req, res, { roles: ['admin', 'super_admin', 'administrator'] });
  if (!session) return;
  try {
    await ensureTables();
    const storeId = String(req.method === 'PUT' ? req.body?.storeId || '' : req.query?.store_id || '').trim();
    if (!storeId) return res.status(400).json({ success: false, error: 'Selecteer eerst een filiaal.' });
    const [storeRows] = await db.query('SELECT id, store_name FROM stores WHERE id = ? LIMIT 1', [storeId]);
    if (!storeRows[0]) return res.status(404).json({ success: false, error: 'Filiaal niet gevonden.' });

    if (req.method === 'GET') {
      const [rows] = await db.query('SELECT excluded_products, category_rules FROM pos_store_catalog_exclusions WHERE store_id = ? LIMIT 1', [storeId]);
      if (rows[0]) {
        return res.status(200).json({ success: true, storeId, excludedProducts: parse(rows[0].excluded_products, []), excludedCategories: [], categoryRules: parse(rows[0].category_rules, {}), configured: true });
      }
      // Older POS versions stored exclusions in the shared table. Expose
      // those as defaults until this branch gets its own saved configuration.
      const [legacyRows] = await db.query('SELECT excluded_products, excluded_categories, category_rules FROM pos_catalog_exclusions WHERE id = 1 LIMIT 1');
      if (legacyRows[0]) {
        const legacyRules = normalizeRules(parse(legacyRows[0].category_rules, {}));
        const legacyCategories = parse(legacyRows[0].excluded_categories, []).map(String);
        for (const id of legacyCategories) {
          if (!legacyRules[id]) legacyRules[id] = { excluded: true, priority: 0 };
        }
        return res.status(200).json({
          success: true,
          storeId,
          excludedProducts: parse(legacyRows[0].excluded_products, []),
          excludedCategories: legacyCategories,
          categoryRules: legacyRules,
          configured: true,
          source: 'legacy-global'
        });
      }
      return res.status(200).json({ success: true, storeId, excludedProducts: [], excludedCategories: [], categoryRules: {}, configured: false });
    }
    if (req.method === 'PUT') {
      const products = [...new Set((Array.isArray(req.body?.excludedProducts) ? req.body.excludedProducts : []).map(Number).filter(id => Number.isInteger(id) && id > 0))];
      const categoryRules = normalizeRules(req.body?.categoryRules);
      await db.query(`INSERT INTO pos_store_catalog_exclusions (store_id, excluded_products, category_rules)
        VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE excluded_products = VALUES(excluded_products), category_rules = VALUES(category_rules)`,
      [storeId, JSON.stringify(products), JSON.stringify(categoryRules)]);

      // The server-side catalog cache contains already-filtered product lists.
      // Expire only this branch immediately so the next POS sync uses the new rules.
      const productCaches = globalThis.__bdmPosProductsCaches;
      const branchCache = productCaches?.get(String(storeId));
      if (branchCache) {
        branchCache.data = null;
        branchCache.updatedAt = 0;
      }

      return res.status(200).json({ success: true, storeId, excludedProducts: products, categoryRules, configured: true });
    }
    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  } catch (error) {
    console.error('[STORE CATALOG EXCLUSIONS]', error.message);
    return res.status(500).json({ success: false, error: 'Filiaal-uitsluitingen konden niet worden verwerkt.' });
  }
}
