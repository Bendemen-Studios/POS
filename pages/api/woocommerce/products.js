import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import { requireSession } from '../../../lib/session';
import db from '../../../lib/db';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SERVER_CACHE_TTL = 5 * 60 * 1000;

// VPS-side warm cache. Next/PM2 processes keep this in memory so the POS
// does not have to wait for WooCommerce on every request.
const getCache = () => {
  if (!globalThis.__bdmPosProductsCache) {
    globalThis.__bdmPosProductsCache = { data: null, updatedAt: 0, loading: null };
  }
  return globalThis.__bdmPosProductsCache;
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const includeExcluded = req.query?.include_excluded === '1' && ['admin', 'super_admin', 'administrator'].includes(String(session.role || '').toLowerCase());
  const formatResponse = (data) => {
    if (!includeExcluded) {
      const { allProducts, ...publicData } = data;
      return publicData;
    }
    const allProducts = Array.isArray(data.allProducts) ? data.allProducts : data.products;
    // Keep the normal POS-visible list in "products". Admin-only callers also
    // receive the unfiltered source list separately for managing exclusions.
    return { ...data, products: data.products, allProducts, count: data.products.length };
  };

  const cache = getCache();
  const forceRefresh = req.query?.refresh === '1' || req.query?.preload === '1' || req.query?._sync != null;
  const cacheAge = Date.now() - cache.updatedAt;

  // Normal POS requests get the warmed VPS cache immediately. Explicit
  // refresh/preload requests rebuild it from WooCommerce.
  if (!forceRefresh && cache.data && cacheAge < SERVER_CACHE_TTL) {
    res.setHeader('Cache-Control', 'private, max-age=0, stale-while-revalidate=300');
    res.setHeader('X-POS-Product-Cache', 'HIT');
    return res.status(200).json(formatResponse(cache.data));
  }

  // Prevent 10 POS terminals from all rebuilding the same WooCommerce cache.
  if (cache.loading) {
    try {
      const data = await cache.loading;
      res.setHeader('Cache-Control', 'private, max-age=0, stale-while-revalidate=300');
      res.setHeader('X-POS-Product-Cache', 'WAIT');
      return res.status(200).json(formatResponse(data));
    } catch (_) {
      // Continue and try a fresh request below.
    }
  }

  cache.loading = (async () => {
    const url = process.env.WOOCOMMERCE_URL || process.env.NEXT_PUBLIC_WOOCOMMERCE_URL || 'https://www.bendemen.com';
    const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOO_CONSUMER_KEY || process.env.WOOCOMMERCE_KEY || process.env.NEXT_PUBLIC_WOOCOMMERCE_KEY;
    const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOO_CONSUMER_SECRET || process.env.WOOCOMMERCE_SECRET || process.env.NEXT_PUBLIC_WOOCOMMERCE_SECRET;

    if (!consumerKey || !consumerSecret) throw new Error('WooCommerce API sleutels zijn niet geconfigureerd in .env');

    const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const customHeaders = {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      'User-Agent': 'BDM-POS-Client/1.0',
      'Cache-Control': 'no-cache'
    };

    const fetchJson = async (endpoint, options = {}, timeoutMs = 20000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(endpoint, {
          ...options,
          headers: { ...customHeaders, ...(options.headers || {}) },
          cache: 'no-store',
          signal: controller.signal
        });
        const text = await response.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
        return data;
      } finally {
        clearTimeout(timer);
      }
    };

    const batchSize = 100;
    const maxPages = 1000;
    const products = [];

    // Fetch each allowed status separately: WooCommerce versions and plugins
    // do not consistently support comma-separated status filters.
    for (const productStatus of ['publish', 'private']) {
      for (let page = 1; page <= maxPages; page += 1) {
        const endpoint = `${url}/wp-json/wc/v3/products?per_page=${batchSize}&page=${page}&status=${productStatus}&orderby=menu_order&order=asc`;
        let rawProducts;
        try {
          rawProducts = await fetchJson(endpoint, {}, 20000);
        } catch (fetchErr) {
          console.warn(`[PRODUCTS API]: ${productStatus} batch ${page} via fetch mislukt: ${fetchErr.message}. Probeert SDK fallback...`);
          try {
            const api = new WooCommerceRestApi({ url, consumerKey, consumerSecret, version: 'wc/v3', axiosConfig: { timeout: 25000, headers: customHeaders } });
            const response = await api.get('products', { per_page: batchSize, page, status: productStatus, orderby: 'menu_order', order: 'asc' });
            rawProducts = response.data || [];
          } catch (sdkErr) {
            console.error(`[PRODUCTS API]: ${productStatus} batch ${page} definitief mislukt:`, sdkErr.message);
            throw sdkErr;
          }
        }
        if (!Array.isArray(rawProducts) || rawProducts.length === 0) break;
        products.push(...rawProducts);
        console.log(`[PRODUCTS API]: ${productStatus} batch ${page} geladen (${rawProducts.length}), totaal ${products.length}`);
        if (rawProducts.length < batchSize) break;
        await sleep(50);
      }
    }
    const uniqueProducts = [...new Map(products.map(product => [Number(product.id), product])).values()];
    products.length = 0;
    products.push(...uniqueProducts);

    products.sort((a, b) => {
      const orderA = Number.isFinite(Number(a.menu_order)) ? Number(a.menu_order) : 0;
      const orderB = Number.isFinite(Number(b.menu_order)) ? Number(b.menu_order) : 0;
      return orderA - orderB || Number(a.id || 0) - Number(b.id || 0);
    });

    const variableProducts = products.filter(
      (product) => product.type === 'variable' && Array.isArray(product.variations) && product.variations.length > 0
    );
    const variationMap = new Map();
    const variationBatchSize = 20;

    for (let start = 0; start < variableProducts.length; start += variationBatchSize) {
      const batch = variableProducts.slice(start, start + variationBatchSize);
      await Promise.all(batch.map(async (product) => {
        try {
          const allVariations = [];
          for (let page = 1; page <= maxPages; page += 1) {
            const variations = await fetchJson(
              `${url}/wp-json/wc/v3/products/${product.id}/variations?per_page=${batchSize}&page=${page}&orderby=menu_order&order=asc`,
              {},
              20000
            );
            if (!Array.isArray(variations) || variations.length === 0) break;
            allVariations.push(...variations);
            if (variations.length < batchSize) break;
          }
          allVariations.sort((a, b) => {
            const orderA = Number.isFinite(Number(a.menu_order)) ? Number(a.menu_order) : 0;
            const orderB = Number.isFinite(Number(b.menu_order)) ? Number(b.menu_order) : 0;
            return orderA - orderB || Number(a.id || 0) - Number(b.id || 0);
          });
          variationMap.set(product.id, allVariations);
        } catch (err) {
          console.error(`[VARIATION SKIPPED] Fout bij ophalen variaties voor product #${product.id}:`, err.message);
          variationMap.set(product.id, []);
        }
      }));
      console.log(`[PRODUCTS API]: variatiebatch verwerkt (${Math.min(start + variationBatchSize, variableProducts.length)}/${variableProducts.length})`);
    }

    let catalogCategories = [];
    try {
      for (let page = 1; page <= maxPages; page += 1) {
        const pageCategories = await fetchJson(`${url}/wp-json/wc/v3/products/categories?per_page=${batchSize}&page=${page}&hide_empty=false&orderby=parent&order=asc`, {}, 20000);
        if (!Array.isArray(pageCategories) || pageCategories.length === 0) break;
        catalogCategories.push(...pageCategories.map(category => ({ id: Number(category.id), name: category.name, slug: category.slug || '', parent: Number(category.parent || 0) })));
        if (pageCategories.length < batchSize) break;
      }
      catalogCategories = [...new Map(catalogCategories.map(category => [category.id, category])).values()];
    } catch (categoryError) {
      console.error('[PRODUCTS API] Categorieboom ophalen mislukt:', categoryError.message);
      catalogCategories = [...new Map(products.flatMap(product => product.categories || []).map(category => [Number(category.id), { id: Number(category.id), name: category.name, slug: category.slug || '', parent: 0 }])).values()];
    }

    const normalizedProducts = products.map((product) => {
      const rawVariations = variationMap.get(product.id) || [];
      const variationsData = rawVariations.map((v) => ({
        id: v.id,
        variation_id: v.id,
        menu_order: v.menu_order ?? 0,
        price: v.price || v.regular_price || 0,
        regular_price: v.regular_price || 0,
        sale_price: v.sale_price || null,
        stock_quantity: v.stock_quantity,
        in_stock: v.in_stock ?? v.stock_status === 'instock',
        attributes: Array.isArray(v.attributes)
          ? v.attributes.map((attr) => ({ id: attr.id, name: attr.name, option: attr.option }))
          : []
      }));

      return {
        id: product.id,
        name: product.name,
        status: product.status || 'publish',
        slug: product.slug,
        menu_order: product.menu_order ?? 0,
        price: product.price || product.regular_price || 0,
        regular_price: product.regular_price || 0,
        sale_price: product.sale_price || null,
        stock_quantity: product.stock_quantity,
        in_stock: product.in_stock ?? product.stock_status === 'instock',
        type: product.type,
        categories: Array.isArray(product.categories)
          ? product.categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))
          : [],
        primary_category_id: Number((product.meta_data || []).find(meta => ['_yoast_wpseo_primary_product_cat', 'rank_math_primary_product_cat', '_rank_math_primary_product_cat'].includes(meta.key))?.value || product.primary_category_id || product.categories?.[0]?.id || 0),
        images: Array.isArray(product.images)
          ? product.images.map((img) => ({ id: img.id, src: img.src, alt: img.alt }))
          : [],
        attributes: Array.isArray(product.attributes) ? product.attributes : [],
        variations: Array.isArray(product.variations) ? product.variations : [],
        variations_data: variationsData
      };
    });

    // Apply centrally stored admin exclusions to the POS catalog only.
    // WooCommerce products and categories remain untouched on the webshop.
    let excludedProductIds = [];
    let excludedCategoryIds = [];
    let categoryRules = {};
    try {
      await db.query(`CREATE TABLE IF NOT EXISTS pos_catalog_exclusions (
        id TINYINT NOT NULL PRIMARY KEY, excluded_products LONGTEXT NOT NULL,
        excluded_categories LONGTEXT NOT NULL, category_rules LONGTEXT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`);
      try { await db.query('ALTER TABLE pos_catalog_exclusions ADD COLUMN category_rules LONGTEXT NULL'); } catch (_) {}
      const [exclusionRows] = await db.query('SELECT excluded_products, excluded_categories, category_rules FROM pos_catalog_exclusions WHERE id = 1');
      if (exclusionRows[0]) {
        excludedProductIds = JSON.parse(exclusionRows[0].excluded_products || '[]').map(Number);
        excludedCategoryIds = JSON.parse(exclusionRows[0].excluded_categories || '[]').map(String);
        try { categoryRules = JSON.parse(exclusionRows[0].category_rules || '{}') || {}; } catch (_) {}
      }
    } catch (exclusionError) { console.error('[PRODUCTS API] Uitsluitingen konden niet worden geladen:', exclusionError.message); }
    const excludedProductSet = new Set(excludedProductIds);
    const legacyExcludedSet = new Set(excludedCategoryIds);
    const visibleProducts = normalizedProducts.filter(product => {
      if (excludedProductSet.has(Number(product.id))) return false;
      const assigned = (product.categories || []).map(category => String(category.id));
      const matchingRules = assigned.map(id => {
        const rule = categoryRules[id];
        if (rule && typeof rule === 'object') return { id, excluded: rule.excluded === true, priority: Math.max(0, Math.min(999, Number(rule.priority) || 0)) };
        return { id, excluded: legacyExcludedSet.has(id), priority: 0 };
      }).filter(rule => rule.excluded || Number(categoryRules[rule.id]?.priority) > 0 || legacyExcludedSet.has(rule.id));
      if (!matchingRules.length) return true;
      matchingRules.sort((a, b) => b.priority - a.priority || Number(b.excluded) - Number(a.excluded) || Number(a.id) - Number(b.id));
      return !matchingRules[0].excluded;
    });

    return {
      success: true,
      count: visibleProducts.length,
      products: visibleProducts,
      allProducts: normalizedProducts,
      catalogCategories,
      cached_at: new Date().toISOString()
    };
  })();

  try {
    const data = await cache.loading;
    cache.data = data;
    cache.updatedAt = Date.now();
    res.setHeader('Cache-Control', 'private, max-age=0, stale-while-revalidate=300');
    res.setHeader('X-POS-Product-Cache', 'MISS');
    return res.status(200).json(formatResponse(data));
  } catch (error) {
    // Manual syncs must never report success when only stale VPS cache is available.
    if (cache.data && req.query?.fresh !== '1') {
      res.setHeader('X-POS-Product-Cache', 'STALE');
      return res.status(200).json({ ...formatResponse(cache.data), stale: true });
    }
    console.error('Fout bij ophalen WooCommerce producten:', error);
    return res.status(503).json({ success: false, stale: Boolean(cache.data), error: error.message || 'Fout bij ophalen producten' });
  } finally {
    cache.loading = null;
  }
}