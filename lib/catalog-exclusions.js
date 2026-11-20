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

  const assignedCategoryIds = new Set(
    (Array.isArray(product.categories) ? product.categories : [])
      .map(category => category?.id ?? category)
      .filter(id => id !== null && id !== undefined && String(id) !== '')
      .map(String)
  );
  if (product.primary_category_id) assignedCategoryIds.add(String(product.primary_category_id));

  const categoryRules = exclusions.categoryRules || {};
  const parentById = new Map(
    (Array.isArray(catalogCategories) ? catalogCategories : [])
      .map(category => [String(category.id), String(category.parent || '0')])
  );

  // A parent exclusion is a hard cascade: every product assigned to one of
  // its descendants is hidden, even if another assigned category has priority.
  for (const assignedId of assignedCategoryIds) {
    let ancestorId = parentById.get(assignedId) || '0';
    const visited = new Set([assignedId]);
    while (ancestorId && ancestorId !== '0' && !visited.has(ancestorId)) {
      if (categoryRules[ancestorId]?.excluded === true) return false;
      visited.add(ancestorId);
      ancestorId = parentById.get(ancestorId) || '0';
    }
  }

  // For multiple direct category assignments, the highest priority wins.
  // This lets a real product category outrank a low-priority auxiliary tag.
  let winningRule = null;
  for (const categoryId of assignedCategoryIds) {
    const rule = categoryRules[categoryId];
    if (!rule || typeof rule !== 'object' ||
        (rule.excluded !== true && rule.excluded !== false)) continue;
    const priorityValue = Number(rule.priority);
    const candidate = {
      excluded: rule.excluded === true,
      priority: Number.isFinite(priorityValue) ? priorityValue : 0
    };
    if (
      !winningRule ||
      candidate.priority > winningRule.priority ||
      (candidate.priority === winningRule.priority && candidate.excluded && !winningRule.excluded)
    ) winningRule = candidate;
  }

  return winningRule ? !winningRule.excluded : true;
}
