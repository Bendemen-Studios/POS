import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  const url = process.env.WOOCOMMERCE_URL || process.env.NEXT_PUBLIC_WOOCOMMERCE_URL || 'https://www.bendemen.com';
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOOCOMMERCE_KEY || process.env.NEXT_PUBLIC_WOOCOMMERCE_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOOCOMMERCE_SECRET || process.env.NEXT_PUBLIC_WOOCOMMERCE_SECRET;

  if (!consumerKey || !consumerSecret) {
    console.error('[PRODUCTS API ERROR]: WooCommerce API keys ontbreken in .env');
    return res.status(500).json({ success: false, error: 'WooCommerce API sleutels zijn niet geconfigureerd in .env' });
  }

  const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const customHeaders = {
    Authorization: authHeader,
    'Content-Type': 'application/json',
    'User-Agent': 'BDM-POS-Client/1.0',
    Connection: 'close',
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

  try {
    const batchSize = 50;
    const maxPages = 1000;
    const products = [];

    // WooCommerce REST API pagination: haal alle producten batch voor batch op.
    // We stoppen zodra een batch kleiner is dan de batch size.
    for (let page = 1; page <= maxPages; page += 1) {
      const endpoint = `${url}/wp-json/wc/v3/products?per_page=${batchSize}&page=${page}&status=publish&orderby=id&order=asc`;
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
            orderby: 'id',
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
      await sleep(75);
    }

    // Variaties worden eveneens in batches per product opgehaald. Alleen variabele
    // producten hebben een extra request nodig.
    const variableProducts = products.filter((product) => product.type === 'variable' && Array.isArray(product.variations) && product.variations.length > 0);
    const variationMap = new Map();

    for (let index = 0; index < variableProducts.length; index += 1) {
      const product = variableProducts[index];
      try {
        const variations = await fetchJson(
          `${url}/wp-json/wc/v3/products/${product.id}/variations?per_page=${batchSize}&page=1`,
          {},
          20000
        );
        variationMap.set(product.id, Array.isArray(variations) ? variations : []);
      } catch (err) {
        console.error(`[VARIATION SKIPPED] Fout bij ophalen variaties voor product #${product.id}:`, err.message);
        variationMap.set(product.id, []);
      }
      if ((index + 1) % 10 === 0) await sleep(75);
    }

    const normalizedProducts = products.map((product) => {
      const rawVariations = variationMap.get(product.id) || [];
      const variationsData = rawVariations.map((v) => ({
        id: v.id,
        variation_id: v.id,
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
        attributes: product.attributes || [],
        variations: product.variations || [],
        variations_data: variationsData
      };
    });

    return res.status(200).json({
      success: true,
      count: normalizedProducts.length,
      products: normalizedProducts
    });
  } catch (error) {
    console.error('Fout bij ophalen WooCommerce producten:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Fout bij ophalen producten'
    });
  }
}