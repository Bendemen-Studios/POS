import { requireSession } from '../../../lib/session';

const fetchWithTimeout = async (url, options, timeoutMs = 7000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, cache: 'no-store' });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
    if (!response.ok) throw new Error(`WooCommerce HTTP ${response.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const session = await requireSession(req, res);
  if (!session) return;

  const ids = String(req.query.ids || '').split(',').map(v => Number(v)).filter(v => Number.isInteger(v) && v > 0).slice(0, 40);
  if (!ids.length) return res.status(400).json({ success: false, error: 'Geen geldige product-ID’s opgegeven.' });

  const url = process.env.WOOCOMMERCE_URL || process.env.NEXT_PUBLIC_WOOCOMMERCE_URL || 'https://www.bendemen.com';
  const key = process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOO_CONSUMER_KEY || process.env.WOOCOMMERCE_KEY || process.env.NEXT_PUBLIC_WOOCOMMERCE_KEY;
  const secret = process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOO_CONSUMER_SECRET || process.env.WOOCOMMERCE_SECRET || process.env.NEXT_PUBLIC_WOOCOMMERCE_SECRET;
  if (!key || !secret) return res.status(500).json({ success: false, error: 'WooCommerce API sleutels ontbreken.' });
  const headers = { Authorization: 'Basic ' + Buffer.from(`${key}:${secret}`).toString('base64'), 'User-Agent': 'BDM-POS-Client/1.0' };

  try {
    const products = await Promise.all(ids.map(async id => {
      const product = await fetchWithTimeout(`${url}/wp-json/wc/v3/products/${id}`, { headers });
      let variations = [];
      if (product.type === 'variable') {
        variations = await fetchWithTimeout(`${url}/wp-json/wc/v3/products/${id}/variations?per_page=100`, { headers });
        if (!Array.isArray(variations)) variations = [];
      }
      return {
        id: product.id,
        stock_quantity: product.stock_quantity,
        in_stock: product.in_stock ?? product.stock_status === 'instock',
        variations_data: variations.map(v => ({
          id: v.id, variation_id: v.id, stock_quantity: v.stock_quantity,
          in_stock: v.in_stock ?? v.stock_status === 'instock',
          price: v.price || v.regular_price || 0, regular_price: v.regular_price || 0,
          sale_price: v.sale_price || null,
          attributes: Array.isArray(v.attributes) ? v.attributes.map(a => ({ id: a.id, name: a.name, option: a.option })) : []
        }))
      };
    }));
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ success: true, products, synced_at: new Date().toISOString() });
  } catch (error) {
    console.error('[QUICK STOCK SYNC]:', error.message);
    return res.status(502).json({ success: false, error: 'Snelle voorraadsync met WooCommerce is mislukt.' });
  }
}
