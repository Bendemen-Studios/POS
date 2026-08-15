import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';

export default async function handler(req, res) {
  const { method } = req;

  // Fallbacks voor verschillende .env-variabelennamen
  const url = process.env.WOOCOMMERCE_URL || process.env.NEXT_PUBLIC_WOOCOMMERCE_URL || 'https://www.bendemen.com';
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOOCOMMERCE_KEY || process.env.NEXT_PUBLIC_WOOCOMMERCE_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOOCOMMERCE_SECRET || process.env.NEXT_PUBLIC_WOOCOMMERCE_SECRET;

  if (!consumerKey || !consumerSecret) {
    return res.status(500).json({
      success: false,
      error: 'WooCommerce API sleutels ontbreken in .env'
    });
  }

  const api = new WooCommerceRestApi({
    url,
    consumerKey,
    consumerSecret,
    version: 'wc/v3',
    axiosConfig: {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  });

  if (method === 'GET') {
    try {
      const { data: orders } = await api.get('orders', {
        per_page: 50,
        order: 'desc',
        orderby: 'date'
      });

      return res.status(200).json({
        success: true,
        count: Array.isArray(orders) ? orders.length : 0,
        orders: Array.isArray(orders) ? orders : []
      });
    } catch (error) {
      console.error('Fout bij ophalen WooCommerce bestellingen:', error.response?.data || error.message);
      return res.status(500).json({
        success: false,
        error: error.response?.data?.message || error.message || 'Fout bij ophalen bestellingen',
        orders: []
      });
    }
  }

  if (method === 'PUT') {
    const { id, status } = req.body;
    if (!id || !status) {
      return res.status(400).json({ success: false, error: 'Order ID en status zijn verplicht.' });
    }

    try {
      const { data: updatedOrder } = await api.put(`orders/${id}`, { status });
      return res.status(200).json({ success: true, order: updatedOrder });
    } catch (error) {
      console.error(`Fout bij bijwerken orderstatus #${id}:`, error.response?.data || error.message);
      return res.status(500).json({
        success: false,
        error: error.response?.data?.message || error.message || 'Fout bij bijwerken orderstatus'
      });
    }
  }

  res.setHeader('Allow', ['GET', 'PUT']);
  return res.status(405).end(`Method ${method} Not Allowed`);
}