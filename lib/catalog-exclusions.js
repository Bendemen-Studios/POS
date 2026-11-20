import db from './db';

const parseArray = value => { try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch (_) { return []; } };
const parseObject = value => { try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; } catch (_) { return {}; } };

export async function getStoreCatalogExclusions(storeId) {
  await db.query(`CREATE TABLE IF NOT EXISTS pos_catalog_exclusions (
    id TINYINT NOT NULL PRIMARY KEY, excluded_products LONGTEXT NOT NULL,
    excluded_categories LONGTEXT NOT NULL, category_rules LONGTEXT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS pos_store_catalog_exclusions (
    store_id VARCHAR(191) NOT NULL PRIMARY KEY,
    excluded_products LONGTEXT NOT NULL,
    category_rules LONGTEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  if (storeId) {
    const [rows] = await db.query('SELECT excluded_products, category_rules FROM pos_store_catalog_exclusions WHERE store_id = ? LIMIT 1', [String(storeId)]);
    if (rows[0]) return { excludedProducts: parseArray(rows[0].excluded_products).map(Number), categoryRules: parseObject(rows[0].category_rules), storeId: String(storeId), source: 'store' };
  }
  // Branch settings are isolated. Never apply a shared/global exclusion set
  // to a branch that has no saved configuration of its own.
  return { excludedProducts: [], categoryRules: {}, storeId: storeId ? String(storeId) : null, source: 'store-empty' };
}

export function isCatalogProductVisible(product, exclusions, catalogCategories = []) {
  if ((exclusions.excludedProducts || []).includes(Number(product.id))) return false;
  const categoryById = new Map(catalogCategories.map(category => [String(category.id), category]));
  const relevantIds = new Set();
  (product.categories || []).forEach(category => {
    let current = categoryById.get(String(category.id));
    let guard = 0;
    while (current && guard < 30) {
      relevantIds.add(String(current.id));
      current = categoryById.get(String(current.parent || 0));
      guard += 1;
    }
    relevantIds.add(String(category.id));
  });
  const matchingRules = [...relevantIds].map(id => {
    const rule = exclusions.categoryRules?.[id];
    return rule ? { id, excluded: rule.excluded === true, priority: Math.max(0, Math.min(999, Number(rule.priority) || 0)) } : null;
  }).filter(Boolean);
  if (!matchingRules.length) return true;
  matchingRules.sort((a, b) => b.priority - a.priority || Number(b.excluded) - Number(a.excluded) || Number(a.id) - Number(b.id));
  return !matchingRules[0].excluded;
}
