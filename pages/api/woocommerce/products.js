import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';

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

  const cache = getCache();
  const forceRefresh = req.query?.refresh === '1' || req.query?.preload === '1';
  const cacheAge = Date.now() - cache.updatedAt;

  // Normal POS requests get the warmed VPS cache immediately. Explicit
  // refresh/preload requests rebuild it from WooCommerce.
  if (!forceRefresh && cache.data && cacheAge < SERVER_CACHE_TTL) {
    res.setHeader('Cache-Control', 'private, max-age=0, stale-while-revalidate=300');
    res.setHeader('X-POS-Product-Cache', 'HIT');
    return res.status(200).json(cache.data);
  }

  // Prevent 10 POS terminals from all rebuilding the same WooCommerce cache.
  if (cache.loading) {
    try {
      const data = await cache.loading;
      res.setHeader('Cache-Control', 'private, max-age=0, stale-while-revalidate=300');
      res.setHeader('X-POS-Product-Cache', 'WAIT');
      return res.status(200).json(data);
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

    for (let page = 1; page <= maxPages; page += 1) {
      const endpoint = `${url}/wp-json/wc/v3/products?per_page=${batchSize}&page=${page}&status=publish&orderby=menu_order&order=asc`;
      let rawProducts;

      try {
        rawProducts = await fetchJson(endpoint, {}, 20000);
      } catch (fetchErr) {
        console.warn(`[PRODUCTS API]: Batch ${page} via fetch mislukt: ${fetchErr.message}. Probeert SDK fallback...`);
        try {
          const api = new WooCommerceRestApi({
            url,
            consumerKey,
            consumerSecret,
            version: 'wc/v3',
            axiosConfig: { timeout: 25000, headers: customHeaders }
          });
          const response = await api.get('products', {
            per_page: batchSize,
            page,
            status: 'publish',
            orderby: 'menu_order',
            order: 'asc'
          });
          rawProducts = response.data || [];
        } catch (sdkErr) {
          console.error(`[PRODUCTS API]: Batch ${page} definitief mislukt:`, sdkErr.message);
          throw sdkErr;
        }
      }

      if (!Array.isArray(rawProducts) || rawProducts.length === 0) break;
      products.push(...rawProducts);
      console.log(`[PRODUCTS API]: batch ${page} geladen (${rawProducts.length}), totaal ${products.length}`);
      if (rawProducts.length < batchSize) break;
      await sleep(50);
    }

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
        images: Array.isArray(product.images)
          ? product.images.map((img) => ({ id: img.id, src: img.src, alt: img.alt }))
          : [],
        attributes: Array.isArray(product.attributes) ? product.attributes : [],
        variations: Array.isArray(product.variations) ? product.variations : [],
        variations_data: variationsData
      };
    });

    return {
      success: true,
      count: normalizedProducts.length,
      products: normalizedProducts,
      cached_at: new Date().toISOString()
    };
  })();

  try {
    const data = await cache.loading;
    cache.data = data;
    cache.updatedAt = Date.now();
    res.setHeader('Cache-Control', 'private, max-age=0, stale-while-revalidate=300');
    res.setHeader('X-POS-Product-Cache', 'MISS');
    return res.status(200).json(data);
  } catch (error) {
    // If WooCommerce is temporarily down, serve the last VPS cache rather than failing the POS.
    if (cache.data) {
      res.setHeader('X-POS-Product-Cache', 'STALE');
      return res.status(200).json({ ...cache.data, stale: true });
    }
    console.error('Fout bij ophalen WooCommerce producten:', error);
    return res.status(500).json({ success: false, error: error.message || 'Fout bij ophalen producten' });
  } finally {
    cache.loading = null;
  }
}