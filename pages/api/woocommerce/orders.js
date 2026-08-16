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

  const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

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
            timeout: 15000,
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

        const fetchRes = await fetch(`${url}/wp-json/wc/v3/orders?per_page=50&order=desc&orderby=date`, {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          }
        });

        if (!fetchRes.ok) {
          const errText = await fetchRes.text();
          throw new Error(`HTTP ${fetchRes.status}: ${errText}`);
        }

        orders = await fetchRes.json();
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

        const fetchRes = await fetch(`${url}/wp-json/wc/v3/orders/${id}`, {
          method: 'PUT',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ status })
        });

        if (!fetchRes.ok) {
          const errText = await fetchRes.text();
          throw new Error(`HTTP ${fetchRes.status}: ${errText}`);
        }

        updatedOrder = await fetchRes.json();
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