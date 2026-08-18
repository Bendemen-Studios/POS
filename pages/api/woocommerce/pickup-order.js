import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';

const api = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL || 'https://www.bendemen.com',
  consumerKey: process.env.WOOCOMMERCE_CK,
  consumerSecret: process.env.WOOCOMMERCE_CS,
  version: 'wc/v3'
});

export default async function handler(req, res) {
  const { method } = req;

  // Ondersteun zowel GET (ophalen afhaalbestellingen per pickup_id) als PUT (status updaten)
  if (method === 'GET') {
    try {
      const { pickup_id, store_id } = req.query;

      // Haal orders op van WooCommerce (bijv. 'processing' of 'completed' die klaarstaan voor afhalen)
      const response = await api.get('orders', {
        per_page: 50,
        status: 'processing,pending'
      });

      const orders = response.data || [];

      // Filter optioneel op basis van Local Pickup Plus / Pickup ID of gekoppeld filiaal
      const filteredOrders = orders.filter(order => {
        // Controleer of de bestelling kiest voor lokale aflevering / pickup
        const isPickup = order.shipping_lines?.some(line => 
          line.method_id?.includes('local_pickup') || line.method_title?.toLowerCase().includes('afhalen')
        );

        if (!isPickup && !pickup_id) return false;

        // Als er een specifiek pickup_id of store_id is meegegeven, filter daarop
        if (pickup_id) {
          // Check of de pickup location ID overeenkomt in meta_data of shipping_lines
          const matchesMeta = order.meta_data?.some(meta => 
            meta.key.includes('pickup') && String(meta.value) === String(pickup_id)
          );
          return matchesMeta || isPickup;
        }

        return true;
      });

      return res.status(200).json({ success: true, orders: filteredOrders });
    } catch (error) {
      console.error('WooCommerce Pickup Orders Error:', error.response?.data || error.message);
      return res.status(500).json({ success: false, error: 'Kan afhaalbestellingen niet ophalen uit WooCommerce.' });
    }
  } 
  
  else if (method === 'PUT') {
    try {
      const { order_id, status } = req.body;

      if (!order_id) {
        return res.status(400).json({ success: false, error: 'Order ID is verplicht.' });
      }

      const response = await api.put(`orders/${order_id}`, {
        status: status || 'completed'
      });

      return res.status(200).json({ success: true, order: response.data, message: 'Afhaalbestelling succesvol afgerond!' });
    } catch (error) {
      console.error('WooCommerce Update Order Error:', error.response?.data || error.message);
      return res.status(500).json({ success: false, error: 'Kon de status van de afhaalbestelling niet bijwerken.' });
    }
  }

  return res.setHeader('Allow', ['GET', 'PUT']).status(405).end(`Method ${method} Not Allowed`);
}