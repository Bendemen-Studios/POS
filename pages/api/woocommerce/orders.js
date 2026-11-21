import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import axios from 'axios';
import { getWooHttpsAgent } from '../../../lib/woocommerce-transport';
import { requireSession } from '../../../lib/session';
import { fetchBdmposOrders, completeBdmposOrder, callBdmposWooApi } from '../../../lib/bdmpos-core';

export default async function handler(req, res) {
  const { method } = req;
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate');

  const session = await requireSession(req, res, { roles: ['admin', 'super_admin', 'administrator'] });
  if (!session) return;

  // Order reads and writes use Core when configured. The existing POS route
  // remains the single application workflow; Core only forwards the WooCommerce operation.
  if (method === 'GET' && process.env.BDMPOS_CORE_URL && process.env.BDMPOS_CORE_SECRET) {
    try {
      const data = await fetchBdmposOrders({
        page: req.query?.page || 1,
        perPage: req.query?.per_page || 50,
        after: req.query?.after,
        before: req.query?.before,
        status: req.query?.status
      });
      return res.status(200).json({
        success: true,
        count: data.orders.length,
        total: Number(data.total || data.orders.length),
        total_pages: Number(data.total_pages || 1),
        orders: data.orders,
        source: 'bdmpos-core',
        read_only: true
      });
    } catch (error) {
      console.error('[ORDERS API]: BDM POS Core read failed:', error.message);
      return res.status(503).json({
        success: false,
        error: error.message || 'Fout bij synchroniseren van bestellingen via BDM POS Core',
        orders: [],
        source: 'bdmpos-core'
      });
    }
  }

  // Fallbacks voor verschillende .env-variabelennamen
  const url = process.env.WOOCOMMERCE_URL || process.env.NEXT_PUBLIC_WOOCOMMERCE_URL || 'https://www.bendemen.com';
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOO_CONSUMER_KEY || process.env.WOOCOMMERCE_KEY || process.env.NEXT_PUBLIC_WOOCOMMERCE_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOO_CONSUMER_SECRET || process.env.WOOCOMMERCE_SECRET || process.env.NEXT_PUBLIC_WOOCOMMERCE_SECRET;

  if (!consumerKey || !consumerSecret) {
    return res.status(500).json({
      success: false,
      error: 'WooCommerce API sleutels ontbreken in .env'
    });
  }

  const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const httpsAgent = getWooHttpsAgent();

  // GET: Bestellingen ophalen
  if (method === 'GET') {
    try {
      let orders = [];

      try {
        const api = new WooCommerceRestApi({
          url,
          consumerKey,
          consumerSecret,
          version: 'wc/v3',
          axiosConfig: {
            timeout: 30000,
            httpsAgent,
            headers: {
              'Content-Type': 'application/json',
              'Connection': 'close'
            }
          }
        });

        const { data } = await api.get('orders', {
          per_page: 50,
          order: 'desc',
          orderby: 'date'
        });
        orders = data;
      } catch (sdkErr) {
        console.warn('[ORDERS API]: SDK GET mislukt/timeout, schakelt over naar native fetch fallback...', sdkErr.message);

        const fallbackResponse = await axios.get(`${url}/wp-json/wc/v3/orders`, { params: { per_page: 50, order: 'desc', orderby: 'date' }, timeout: 30000, httpsAgent, headers: { Authorization: authHeader, 'Content-Type': 'application/json' } });
        orders = fallbackResponse.data;
      }

      return res.status(200).json({
        success: true,
        count: Array.isArray(orders) ? orders.length : 0,
        orders: Array.isArray(orders) ? orders : []
      });

    } catch (error) {
      console.error('Fout bij ophalen WooCommerce bestellingen:', error.message);
      return res.status(500).json({
        success: false,
        error: error.message || 'Fout bij ophalen bestellingen',
        orders: []
      });
    }
  }

  // PUT: Orderstatus bijwerken
  if (method === 'PUT') {
    const { id, status } = req.body;
    if (!id || !status) {
      return res.status(400).json({ success: false, error: 'Order ID en status zijn verplicht.' });
    }
    if (process.env.BDMPOS_CORE_URL && process.env.BDMPOS_CORE_SECRET && String(status || '').toLowerCase() !== 'completed') {
      try {
        const result = await callBdmposWooApi({ method: 'PUT', path: `/orders/${encodeURIComponent(String(id))}`, data: { status } });
        return res.status(200).json({ success: true, order: result.data, source: 'bdmpos-core' });
      } catch (error) {
        console.error('[ORDERS API]: BDM POS Core update failed:', error.message);
        return res.status(503).json({ success: false, error: error.message || 'Bestelling bijwerken via BDM POS Core mislukt.' });
      }
    }
    if (String(status || '').toLowerCase() === 'completed' && process.env.BDMPOS_CORE_URL && process.env.BDMPOS_CORE_SECRET) {
      try {
        const result = await completeBdmposOrder(id, 'Order afgerond via Bendemen POS.');
        return res.status(200).json({ success: true, order: result.order, source: 'bdmpos-core', already_completed: result.already_completed });
      } catch (error) {
        console.error('[ORDERS API]: BDM POS Core completion failed:', error.message);
        return res.status(503).json({ success: false, error: error.message || 'Bestelling afronden via BDM POS Core mislukt.' });
      }
    }
    try {
      let updatedOrder;

      try {
        const api = new WooCommerceRestApi({
          url,
          consumerKey,
          consumerSecret,
          version: 'wc/v3',
          axiosConfig: {
            timeout: 15000,
            headers: {
              'Content-Type': 'application/json',
              'Connection': 'close'
            }
          }
        });

        const { data } = await api.put(`orders/${id}`, { status });
        updatedOrder = data;
      } catch (sdkErr) {
        console.warn(`[ORDERS API]: SDK PUT mislukt voor order #${id}, schakelt over naar native fetch fallback...`, sdkErr.message);

        const fallbackResponse = await axios.put(`${url}/wp-json/wc/v3/orders/${id}`, { status }, { timeout: 30000, httpsAgent, headers: { Authorization: authHeader, 'Content-Type': 'application/json' } });
        updatedOrder = fallbackResponse.data;
      }

      return res.status(200).json({ success: true, order: updatedOrder });

    } catch (error) {
      console.error(`Fout bij bijwerken orderstatus #${id}:`, error.message);
      return res.status(500).json({
        success: false,
        error: error.message || 'Fout bij bijwerken orderstatus'
      });
    }
  }

  res.setHeader('Allow', ['GET', 'PUT']);
  return res.status(405).end(`Method ${method} Not Allowed`);
}