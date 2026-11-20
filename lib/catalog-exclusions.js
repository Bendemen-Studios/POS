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

export function isCatalogProductVisible(product, exclusions) {
  if ((exclusions.excludedProducts || []).includes(Number(product.id))) return false;

  // Category rules are intentionally independent: only categories directly
  // assigned to the product can hide it. A parent exclusion must not cascade
  // into child categories, and a child exclusion must not hide products that
  // are assigned only to the parent.
  const assignedCategoryIds = new Set(
    (Array.isArray(product.categories) ? product.categories : [])
      .map(category => category?.id ?? category)
      .filter(id => id !== null && id !== undefined && String(id) !== '')
      .map(String)
  );
  if (product.primary_category_id) assignedCategoryIds.add(String(product.primary_category_id));

  for (const id of assignedCategoryIds) {
    if (exclusions.categoryRules?.[id]?.excluded === true) return false;
  }
  return true;
}
