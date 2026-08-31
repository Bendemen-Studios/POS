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
    version: 'wc/v3'
  });
}

function sendApiError(res, status, message) {
  return res.status(status).json({ success: false, error: message });
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

      const response = await api.get('orders', {
        per_page: 50,
        status: 'processing,pending'
      });

      const orders = response.data || [];

      const filteredOrders = orders.filter(order => {
        const isPickup = order.shipping_lines?.some(line =>
          String(line.method_id || '').includes('local_pickup') ||
          String(line.method_title || '').toLowerCase().includes('afhalen')
        );

        if (!isPickup && !pickup_id) return false;

        if (pickup_id) {
          const matchesMeta = order.meta_data?.some(meta =>
            String(meta.key || '').toLowerCase().includes('pickup') &&
            String(meta.value) === String(pickup_id)
          );
          return matchesMeta || isPickup;
        }

        return true;
      });

      res.setHeader('Cache-Control', 'no-store, max-age=0');
      return res.status(200).json({ success: true, orders: filteredOrders });
    } catch (error) {
      console.error('WooCommerce Pickup Orders Error:', error.response?.data || error.message);
      return sendApiError(res, 502, `Kan afhaalbestellingen niet ophalen uit WooCommerce: ${error.response?.data?.message || error.message || 'onbekende fout'}`);
    }
  }

  if (method === 'PUT') {
    try {
      const { order_id, status } = req.body || {};

      if (!order_id) {
        return sendApiError(res, 400, 'Order ID is verplicht.');
      }

      const response = await api.put(`orders/${order_id}`, {
        status: status || 'completed'
      });

      return res.status(200).json({ success: true, order: response.data, message: 'Afhaalbestelling succesvol afgerond!' });
    } catch (error) {
      console.error('WooCommerce Update Order Error:', error.response?.data || error.message);
      return sendApiError(res, 502, `Kon de status van de afhaalbestelling niet bijwerken: ${error.response?.data?.message || error.message || 'onbekende fout'}`);
    }
  }

  res.setHeader('Allow', ['GET', 'PUT']);
  return res.status(405).send(`Method ${method} Not Allowed`);
}
