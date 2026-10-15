import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';
import { requireSession } from '../../../lib/session';
import db from '../../../lib/db';

function getWooCommerceApi() {
  const url = process.env.WOO_SITE_URL || process.env.WOOCOMMERCE_URL || 'https://www.bendemen.com';
  const consumerKey = process.env.WOOCOMMERCE_CK || process.env.WOO_CONSUMER_KEY || process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOOCOMMERCE_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CS || process.env.WOO_CONSUMER_SECRET || process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOOCOMMERCE_SECRET;

  if (!consumerKey || !consumerSecret) return null;

  return new WooCommerceRestApi({
    url,
    consumerKey,
    consumerSecret,
    version: 'wc/v3',
    axiosConfig: { timeout: 20000 },
  });
}

function sendApiError(res, status, message) {
  return res.status(status).json({ success: false, error: message });
}

function isPickupOrder(order) {
  const shippingPickup = Array.isArray(order.shipping_lines) && order.shipping_lines.some((line) => {
    const methodId = String(line.method_id || '').toLowerCase();
    const methodTitle = String(line.method_title || '').toLowerCase();
    return methodId.includes('local_pickup') || methodTitle.includes('afhalen') || methodTitle.includes('afhaal');
  });

  const metaPickup = Array.isArray(order.meta_data) && order.meta_data.some((meta) => {
    const key = String(meta.key || '').toLowerCase();
    return key.includes('pickup') || key.includes('afhaal');
  });

  return shippingPickup || metaPickup;
}

function matchesPickupId(order, pickupId) {
  if (!pickupId || !Array.isArray(order.meta_data)) return false;
  return order.meta_data.some((meta) => {
    const key = String(meta.key || '').toLowerCase();
    return key.includes('pickup') && String(meta.value ?? '') === String(pickupId);
  });
}

async function getOrdersForStatus(api, status) {
  const perPage = 100;
  const first = await api.get('orders', {
    per_page: perPage,
    page: 1,
    status,
    orderby: 'date',
    order: 'desc',
  });

  const firstOrders = Array.isArray(first.data) ? first.data : [];
  const totalPages = Math.min(
    100,
    Math.max(1, Number(first.headers?.['x-wp-totalpages'] || first.headers?.['X-WP-TotalPages'] || 1))
  );

  if (totalPages === 1) return firstOrders;

  const responses = [];
  // Bound concurrent requests to avoid flooding WooCommerce when the order
  // history spans many pages.
  for (let startPage = 2; startPage <= totalPages; startPage += 5) {
    const pageBatch = Array.from(
      { length: Math.min(5, totalPages - startPage + 1) },
      (_, index) => startPage + index
    );
    const batchResponses = await Promise.all(pageBatch.map(page => api.get('orders', {
      per_page: perPage,
      page,
      status,
      orderby: 'date',
      order: 'desc',
    })));
    responses.push(...batchResponses);
  }

  return firstOrders.concat(
    ...responses.map((response) => Array.isArray(response.data) ? response.data : [])
  );
}

export default async function handler(req, res) {
  const { method } = req;
  const session = await requireSession(req, res);
  if (!session) return;
  const api = getWooCommerceApi();
  const role = String(session.role || '').toLowerCase();
  const isAdmin = ['admin', 'super_admin', 'administrator'].includes(role) ||
    String(session.username || '').toLowerCase() === 'bendemen';
  let assignedStoreIds = [];
  let assignedPickupIds = [];

  if (!isAdmin) {
    assignedStoreIds = String(session.store_id || '').split(',').map(id => id.trim()).filter(Boolean);
    if (!assignedStoreIds.length) {
      return res.status(403).json({ success: false, error: 'Je account is niet gekoppeld aan een filiaal.' });
    }
    const placeholders = assignedStoreIds.map(() => '?').join(',');
    const [assignedStores] = await db.query(
      `SELECT id, pickup_id FROM stores WHERE CAST(id AS CHAR) IN (${placeholders})`,
      assignedStoreIds
    );
    assignedStoreIds = Array.isArray(assignedStores) ? assignedStores.map(store => String(store.id)) : [];
    assignedPickupIds = Array.isArray(assignedStores)
      ? assignedStores.map(store => String(store.pickup_id || '')).filter(Boolean)
      : [];
    const requestedPickupId = req.query?.pickup_id;
    if (requestedPickupId && !assignedPickupIds.includes(String(requestedPickupId))) {
      return res.status(403).json({ success: false, error: 'Dit afhaalpunt hoort niet bij jouw filiaal.' });
    }
  }

  if (!api) {
    return sendApiError(res, 500, 'WooCommerce API-sleutels ontbreken op de POS-server. Controleer WOO_CONSUMER_KEY/WOO_CONSUMER_SECRET (of WOOCOMMERCE_CK/WOOCOMMERCE_CS).');
  }

  if (method === 'GET') {
    try {
      const { pickup_id } = req.query;

      const [pendingOrders, processingOrders] = await Promise.all([
        getOrdersForStatus(api, 'pending'),
        getOrdersForStatus(api, 'processing'),
      ]);

      const byId = new Map();
      [...pendingOrders, ...processingOrders].forEach((order) => {
        if (order?.id) byId.set(String(order.id), order);
      });

      const filteredOrders = Array.from(byId.values())
        .filter((order) => {
          const pickup = isPickupOrder(order);
          if (!pickup) return false;
          if (pickup_id) return matchesPickupId(order, pickup_id);
          if (isAdmin) return true;

          const storeMeta = Array.isArray(order.meta_data)
            ? order.meta_data.find(meta => String(meta.key || '') === '_pos_store_id')
            : null;
          return assignedStoreIds.includes(String(storeMeta?.value || '')) ||
            assignedPickupIds.some(id => matchesPickupId(order, id));
        })
        .sort((a, b) => new Date(b.date_created || 0).getTime() - new Date(a.date_created || 0).getTime());

      res.setHeader('Cache-Control', 'private, max-age=0, no-cache, no-store, must-revalidate');
      return res.status(200).json({
        success: true,
        orders: filteredOrders,
        total: filteredOrders.length,
        source: 'woocommerce',
      });
    } catch (error) {
      console.error('WooCommerce Pickup Orders Error:', error.response?.data || error.message);
      return sendApiError(
        res,
        502,
        `Kan afhaalbestellingen niet ophalen uit WooCommerce: ${error.response?.data?.message || error.message || 'onbekende fout'}`
      );
    }
  }

  if (method === 'PUT') {
    try {
      const { order_id, status } = req.body || {};
      if (!order_id) return sendApiError(res, 400, 'Order ID is verplicht.');

      if (!isAdmin) {
        const existingResponse = await api.get(`orders/${encodeURIComponent(String(order_id))}`);
        const existingOrder = existingResponse.data;
        const storeMeta = Array.isArray(existingOrder?.meta_data)
          ? existingOrder.meta_data.find(meta => String(meta.key || '') === '_pos_store_id')
          : null;
        const allowed = assignedStoreIds.includes(String(storeMeta?.value || '')) ||
          assignedPickupIds.some(id => matchesPickupId(existingOrder, id));
        if (!allowed) return sendApiError(res, 403, 'Deze afhaalbestelling hoort niet bij jouw filiaal.');
      }

      const response = await api.put(`orders/${encodeURIComponent(String(order_id))}`, {
        status: status || 'completed',
      });

      return res.status(200).json({
        success: true,
        order: response.data,
        message: 'Afhaalbestelling succesvol afgerond!',
      });
    } catch (error) {
      console.error('WooCommerce Update Order Error:', error.response?.data || error.message);
      return sendApiError(
        res,
        502,
        `Kon de status van de afhaalbestelling niet bijwerken: ${error.response?.data?.message || error.message || 'onbekende fout'}`
      );
    }
  }

  res.setHeader('Allow', ['GET', 'PUT']);
  return res.status(405).send(`Method ${method} Not Allowed`);
}
