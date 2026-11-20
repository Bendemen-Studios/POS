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
  const assignedCategoryIds = new Set(
    (Array.isArray(product.categories) ? product.categories : [])
      .map(category => category?.id ?? category)
      .filter(id => id !== null && id !== undefined && String(id) !== '')
      .map(String)
  );

  // WooCommerce/SEO plugins can identify a primary category separately.
  // Include it as well so the filter still works when the category array is
  // incomplete or the product has multiple assigned categories.
  if (product.primary_category_id) assignedCategoryIds.add(String(product.primary_category_id));

  const relevantIds = new Set();
  for (const assignedId of assignedCategoryIds) {
    let currentId = assignedId;
    let guard = 0;
    while (currentId && guard < 30 && !relevantIds.has(currentId)) {
      relevantIds.add(currentId);
      const current = categoryById.get(currentId);
      if (!current || !current.parent || Number(current.parent) === 0) break;
      currentId = String(current.parent);
      guard += 1;
    }
  }

  // An exclusion on any assigned category or one of its ancestors must win.
  // Do not let a higher-priority rule on a parent/other category make a
  // product from an explicitly excluded subcategory visible again.
  for (const id of relevantIds) {
    if (exclusions.categoryRules?.[id]?.excluded === true) return false;
  }

  return true;
}
