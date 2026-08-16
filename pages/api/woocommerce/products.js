import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  // Flexibele check voor URL en API keys (pakt alle varianten uit .env)
  const url = process.env.WOOCOMMERCE_URL || process.env.NEXT_PUBLIC_WOOCOMMERCE_URL || 'https://www.bendemen.com';
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOOCOMMERCE_KEY || process.env.NEXT_PUBLIC_WOOCOMMERCE_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOOCOMMERCE_SECRET || process.env.NEXT_PUBLIC_WOOCOMMERCE_SECRET;

  if (!consumerKey || !consumerSecret) {
    console.error('[PRODUCTS API ERROR]: WooCommerce API keys ontbreken in .env');
    return res.status(500).json({
      success: false,
      error: 'WooCommerce API sleutels zijn niet geconfigureerd in .env'
    });
  }

  const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const customHeaders = {
    'Authorization': authHeader,
    'Content-Type': 'application/json',
    'User-Agent': 'BDM-POS-Client/1.0 (Mozilla/5.0; Node.js)',
    'Connection': 'close'
  };

  try {
    let rawProducts = [];

    // Ophalen van gepubliceerde producten via Native Fetch met User-Agent
    try {
      const fetchRes = await fetch(`${url}/wp-json/wc/v3/products?per_page=100&status=publish`, {
        headers: customHeaders
      });

      if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status}: ${await fetchRes.text()}`);
      rawProducts = await fetchRes.json();
    } catch (fetchErr) {
      console.warn('[PRODUCTS API]: Directe fetch mislukt, probeert SDK fallback...', fetchErr.message);
      const api = new WooCommerceRestApi({
        url,
        consumerKey,
        consumerSecret,
        version: 'wc/v3',
        axiosConfig: {
          timeout: 25000,
          headers: customHeaders
        }
      });
      const response = await api.get('products', { per_page: 100, status: 'publish' });
      rawProducts = response.data || [];
    }

    const products = [];

    // Verwerk producten strikt 1 voor 1 met een micro-pauze om Nginx / Wordfence rate-limiting te voorkomen
    for (const product of rawProducts) {
      let variationsData = [];

      if (product.type === 'variable' && Array.isArray(product.variations) && product.variations.length > 0) {
        try {
          // Pauzeer 50ms tussen verzoeken om de webserver rust te geven
          await new Promise((resolve) => setTimeout(resolve, 50));

          const fetchVarRes = await fetch(`${url}/wp-json/wc/v3/products/${product.id}/variations?per_page=100`, {
            headers: customHeaders
          });

          if (fetchVarRes.ok) {
            const rawVariations = await fetchVarRes.json();
            variationsData = (rawVariations || []).map((v) => ({
              id: v.id,
              variation_id: v.id,
              price: v.price || v.regular_price || 0,
              regular_price: v.regular_price || 0,
              sale_price: v.sale_price || null,
              stock_quantity: v.stock_quantity,
              in_stock: v.in_stock ?? v.stock_status === 'instock',
              attributes: Array.isArray(v.attributes)
                ? v.attributes.map((attr) => ({
                    id: attr.id,
                    name: attr.name,
                    option: attr.option
                  }))
                : []
            }));
          }
        } catch (varErr) {
          console.error(`[VARIATION SKIPPED] Fout bij ophalen variaties voor product #${product.id}:`, varErr.message);
        }
      }

      products.push({
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
      });
    }

    return res.status(200).json({
      success: true,
      count: products.length,
      products
    });

  } catch (error) {
    console.error('Fout bij ophalen WooCommerce producten:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Fout bij ophalen producten'
    });
  }
}