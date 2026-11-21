import axios from 'axios';
import { getWooHttpsAgent } from '../../../lib/woocommerce-transport';
import { requireSession } from '../../../lib/session';
import db from '../../../lib/db';
import { getStoreCatalogExclusions, isCatalogProductVisible } from '../../../lib/catalog-exclusions';
import { fetchBdmposCatalog } from '../../../lib/bdmpos-core';

const fetchWithTimeout = async (url, options = {}, timeoutMs = 7000) => {
  const response = await axios.get(url, {
    timeout: timeoutMs,
    httpsAgent: getWooHttpsAgent(),
    headers: options.headers || {},
  });
  return response.data;
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
  const headers = { Authorization: 'Basic ' + Buffer.from(`${key || ''}:${secret || ''}`).toString('base64'), 'User-Agent': 'BDM-POS-Client/1.0' };

  try {
    const assignedStoreIds = String(session.store_id || '').split(',').map(id => id.trim()).filter(Boolean);
    const isAdmin = ['admin', 'super_admin', 'administrator'].includes(String(session.role || '').toLowerCase());
    const storeId = req.query.store_id && (isAdmin || assignedStoreIds.includes(String(req.query.store_id)))
      ? String(req.query.store_id)
      : (assignedStoreIds[0] || null);
    if (req.query.store_id && isAdmin) {
      const [storeRows] = await db.query('SELECT id FROM stores WHERE id = ? LIMIT 1', [storeId]);
      if (!storeRows[0]) return res.status(400).json({ success: false, error: 'Ongeldig filiaal.' });
    }
    const exclusions = await getStoreCatalogExclusions(storeId);

    // Core is used only for stock reads. The response is filtered to the
    // requested product IDs and the caller's existing store visibility rules.
    if (process.env.BDMPOS_CORE_URL && process.env.BDMPOS_CORE_SECRET) {
      const catalog = await fetchBdmposCatalog();
      const wanted = new Set(ids);
      const products = catalog.products
        .filter(product => wanted.has(Number(product.id)))
        .filter(product => isCatalogProductVisible(product, exclusions, catalog.categories))
        .map(product => ({
          id: Number(product.id),
          stock_quantity: product.stock_quantity ?? null,
          in_stock: Boolean(product.in_stock),
          variations_data: Array.isArray(product.variations_data) ? product.variations_data : []
        }));
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json({
        success: true,
        products,
        source: 'bdmpos-core',
        read_only: true,
        synced_at: new Date().toISOString()
      });
    }
    // WooCommerce REST keys are only needed for the legacy direct API path.
    // Core performs the authenticated WordPress-side WooCommerce request itself.
    if (!key || !secret) return res.status(500).json({ success: false, error: 'WooCommerce API sleutels ontbreken en BDM POS Core is niet beschikbaar.' });
    let catalogCategories = [];
    try {
      catalogCategories = await fetchWithTimeout(url + '/wp-json/wc/v3/products/categories?per_page=100&hide_empty=false', { headers });
      if (!Array.isArray(catalogCategories)) catalogCategories = [];
    } catch (_) {}
    const fetchedProducts = await Promise.all(ids.map(async id => {
      const product = await fetchWithTimeout(url + '/wp-json/wc/v3/products/' + id, { headers });
      if (!isCatalogProductVisible(product, exclusions, catalogCategories)) return null;
      let variations = [];
      if (product.type === 'variable') {
        variations = await fetchWithTimeout(url + '/wp-json/wc/v3/products/' + id + '/variations?per_page=100', { headers });
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
    const products = fetchedProducts.filter(Boolean);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ success: true, products, synced_at: new Date().toISOString() });
  } catch (error) {
    console.error('[QUICK STOCK SYNC]:', error.message);
    return res.status(502).json({ success: false, error: 'Snelle voorraadsync met WooCommerce is mislukt.' });
  }
}
