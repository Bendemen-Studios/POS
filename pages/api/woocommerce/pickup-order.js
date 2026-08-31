import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';

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
    axiosConfig: { timeout: 15000 },
  });
}

function sendApiError(res, status, message) {
  return res.status(status).json({ success: false, error: message });
}

function isPickupOrder(order) {
  return Array.isArray(order.shipping_lines) && order.shipping_lines.some((line) => {
    const methodId = String(line.method_id || '').toLowerCase();
    const methodTitle = String(line.method_title || '').toLowerCase();
    return methodId.includes('local_pickup') || methodTitle.includes('afhalen') || methodTitle.includes('afhaal');
  });
}

function matchesPickupId(order, pickupId) {
  if (!pickupId) return false;
  return Array.isArray(order.meta_data) && order.meta_data.some((meta) =>
    String(meta.key || '').toLowerCase().includes('pickup') && String(meta.value ?? '') === String(pickupId)
  );
}

export default async function handler(req, res) {
  const { method } = req;
  const api = getWooCommerceApi();

  if (!api) {
    return sendApiError(res, 500, 'WooCommerce API-sleutels ontbreken op de POS-server. Controleer WOO_CONSUMER_KEY/WOO_CONSUMER_SECRET (of WOOCOMMERCE_CK/WOOCOMMERCE_CS).');
  }

  if (method === 'GET') {
    try {
      const { pickup_id } = req.query;
      const allOrders = [];
      const perPage = 100;
      let page = 1;

      // Haal alle relevante orders op in pagina's zodat oudere/latere afhaalorders niet ontbreken.
      while (page <= 100) {
        const response = await api.get('orders', {
          per_page: perPage,
          page,
          status: 'processing,pending',
          orderby: 'date',
          order: 'asc',
        });

        const orders = Array.isArray(response.data) ? response.data : [];
        allOrders.push(...orders);

        const totalPages = Number(
          response.headers?.['x-wp-totalpages'] ||
          response.headers?.['X-WP-TotalPages'] ||
          0
        );

        if (orders.length < perPage || (totalPages > 0 && page >= totalPages)) break;
        page += 1;
      }

      const filteredOrders = allOrders.filter((order) => {
        const pickup = isPickupOrder(order);
        if (pickup_id) return pickup || matchesPickupId(order, pickup_id);
        return pickup;
      });

      // Nieuwste afhaalbestellingen eerst in de POS.
      filteredOrders.sort((a, b) => {
        const da = new Date(a.date_created || 0).getTime();
        const db = new Date(b.date_created || 0).getTime();
        return db - da;
      });

      res.setHeader('Cache-Control', 'private, max-age=0, no-cache, no-store, must-revalidate');
      return res.status(200).json({ success: true, orders: filteredOrders });
    } catch (error) {
      console.error('WooCommerce Pickup Orders Error:', error.response?.data || error.message);
      return sendApiError(res, 502, `Kan afhaalbestellingen niet ophalen uit WooCommerce: ${error.response?.data?.message || error.message || 'onbekende fout'}`);
    }
  }

  if (method === 'PUT') {
    try {
      const { order_id, status } = req.body || {};
      if (!order_id) return sendApiError(res, 400, 'Order ID is verplicht.');

      const response = await api.put(`orders/${order_id}`, {
        status: status || 'completed'
      });

      return res.status(200).json({
        success: true,
        order: response.data,
        message: 'Afhaalbestelling succesvol afgerond!'
      });
    } catch (error) {
      console.error('WooCommerce Update Order Error:', error.response?.data || error.message);
      return sendApiError(res, 502, `Kon de status van de afhaalbestelling niet bijwerken: ${error.response?.data?.message || error.message || 'onbekende fout'}`);
    }
  }

  res.setHeader('Allow', ['GET', 'PUT']);
  return res.status(405).send(`Method ${method} Not Allowed`);
}
