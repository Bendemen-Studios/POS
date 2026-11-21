import { requireSession } from '../../../lib/session';
import db from '../../../lib/db';
import { callBdmposWooApi } from '../../../lib/bdmpos-core';

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
  if (!pickupId) return false;
  const expected = String(pickupId);
  const metadata = [
    ...(Array.isArray(order.meta_data) ? order.meta_data : []),
    ...(Array.isArray(order.shipping_lines) ? order.shipping_lines.flatMap(line => Array.isArray(line.meta_data) ? line.meta_data : []) : []),
  ];
  return metadata.some(meta => {
    const key = String(meta.key || '').toLowerCase();
    return (key.includes('pickup') || key.includes('afhaal') || key === 'location') && String(meta.value ?? '') === expected;
  });
}

async function getOrdersForStatus(status) {
  if (!process.env.BDMPOS_CORE_URL || !process.env.BDMPOS_CORE_SECRET) {
    throw new Error('BDM POS Core is niet geconfigureerd; afhaalbestellingen worden niet rechtstreeks via WooCommerce benaderd.');
  }
  const perPage = 100;
  const first = await callBdmposWooApi({
    method: 'GET',
    path: '/orders',
    params: { per_page: perPage, page: 1, status, orderby: 'date', order: 'desc' }
  });
  const firstOrders = Array.isArray(first.data) ? first.data : [];
  const totalPages = Math.min(100, Math.max(1, Number(first.headers?.['x-wp-totalpages'] || 1)));
  const pages = [];
  for (let startPage = 2; startPage <= totalPages; startPage += 3) {
    const batch = Array.from({ length: Math.min(3, totalPages - startPage + 1) }, (_, index) => startPage + index);
    const responses = await Promise.all(batch.map(page => callBdmposWooApi({
      method: 'GET',
      path: '/orders',
      params: { per_page: perPage, page, status, orderby: 'date', order: 'desc' }
    })));
    pages.push(...responses.map(response => Array.isArray(response.data) ? response.data : []));
  }
  return firstOrders.concat(...pages);
}

export default async function handler(req, res) {
  const { method } = req;
  const session = await requireSession(req, res);
  if (!session) return;
  const role = String(session.role || '').toLowerCase();
  const isAdmin = ['admin', 'super_admin', 'administrator'].includes(role) ||
    String(session.username || '').toLowerCase() === 'bendemen';
  let assignedStoreIds = [];
  let assignedPickupIds = [];
  let requestedStorePickupIds = [];
  const requestedStoreId = req.query?.store_id ? String(req.query.store_id) : '';
  if (isAdmin && requestedStoreId) {
    const [requestedStores] = await db.query('SELECT id, pickup_id FROM stores WHERE CAST(id AS CHAR) = ?', [requestedStoreId]);
    requestedStorePickupIds = Array.isArray(requestedStores) ? requestedStores.map(store => String(store.pickup_id || '')).filter(Boolean) : [];
  }

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

  if (!process.env.BDMPOS_CORE_URL || !process.env.BDMPOS_CORE_SECRET) {
    return sendApiError(res, 503, 'BDM POS Core is vereist voor het afhaalsysteem.');
  }

  if (method === 'GET') {
    try {
      const pickup_id = req.query?.pickup_id ? String(req.query.pickup_id) : null;
      res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');

      const [pendingOrders, processingOrders, onHoldOrders] = await Promise.all([
        getOrdersForStatus('pending'),
        getOrdersForStatus('processing'),
        getOrdersForStatus('on-hold'),
      ]);

      const byId = new Map();
      [...pendingOrders, ...processingOrders, ...onHoldOrders].forEach((order) => {
        if (order?.id) byId.set(String(order.id), order);
      });

      const filteredOrders = Array.from(byId.values())
        .filter((order) => {
          const pickup = isPickupOrder(order);
          if (!pickup) return false;
          if (pickup_id) return matchesPickupId(order, pickup_id);
          if (isAdmin && requestedStoreId) {
            const storeMeta = Array.isArray(order.meta_data) ? order.meta_data.find(meta => String(meta.key || '') === '_pos_store_id') : null;
            return String(storeMeta?.value || '') === requestedStoreId || requestedStorePickupIds.some(id => matchesPickupId(order, id));
          }
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
      const { order_id } = req.body || {};
      if (!order_id || !/^\d+$/.test(String(order_id))) return sendApiError(res, 400, 'Een geldig order-ID is verplicht.');
      const existingResponse = await callBdmposWooApi({ method: 'GET', path: `/orders/${encodeURIComponent(String(order_id))}` });
      const existingOrder = existingResponse.data;
      if (!existingOrder?.id || !isPickupOrder(existingOrder)) return sendApiError(res, 404, 'Deze bestelling is geen geldige afhaalbestelling.');
      if (!isAdmin) {
        const storeMeta = Array.isArray(existingOrder?.meta_data)
          ? existingOrder.meta_data.find(meta => String(meta.key || '') === '_pos_store_id')
          : null;
        const allowed = assignedStoreIds.includes(String(storeMeta?.value || '')) ||
          assignedPickupIds.some(id => matchesPickupId(existingOrder, id));
        if (!allowed) return sendApiError(res, 403, 'Deze afhaalbestelling hoort niet bij jouw filiaal.');
      }

      const paymentMethod = String((req.body || {}).payment_method || 'cash');
      if (!['cash', 'manual_pin', 'sumup'].includes(paymentMethod)) {
        return sendApiError(res, 400, 'Kies contant, pin of SumUp om deze afhaalbestelling af te rekenen.');
      }
      const paymentTitles = {
        cash: 'Contant (Afhalen)',
        manual_pin: 'Pin (Afhalen)',
        sumup: 'SumUp (Afhalen)'
      };
      const paid = await callBdmposWooApi({
        method: 'PUT',
        path: `/orders/${encodeURIComponent(String(order_id))}`,
        data: {
          status: 'completed',
          set_paid: true,
          payment_method: paymentMethod,
          payment_method_title: paymentTitles[paymentMethod]
        },
        requestId: `pickup-${order_id}-${paymentMethod}`
      });
      const completedOrder = paid.data;

      return res.status(200).json({
        success: true,
        order: completedOrder,
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
