import axios from 'axios';

export default async function handler(req, res) {
  const siteUrl = process.env.WOO_SITE_URL;
  const consumerKey = process.env.WOO_CONSUMER_KEY;
  const consumerSecret = process.env.WOO_CONSUMER_SECRET;

  if (!siteUrl || !consumerKey || !consumerSecret) {
    return res.status(500).json({ success: false, error: 'WooCommerce API gegevens ontbreken in .env' });
  }

  // --- GET: Bestellingen ophalen voor het Admin Paneel ---
  if (req.method === 'GET') {
    try {
      const response = await axios.get(`${siteUrl}/wp-json/wc/v3/orders`, {
        params: {
          per_page: 20,
          consumer_key: consumerKey,
          consumer_secret: consumerSecret
        }
      });

      return res.status(200).json({
        success: true,
        orders: response.data
      });
    } catch (error) {
      console.error('Fout bij ophalen WooCommerce orders:', error.response?.data || error.message);
      return res.status(500).json({ success: false, error: 'Kon bestellingen niet ophalen.' });
    }
  }

  // --- POST: Nieuwe Kassa Bestelling Aanmaken ---
  if (req.method === 'POST') {
    const { orderItems, paymentMethod, storeId, cashierId, customerId, totals } = req.body;

    if (!orderItems || orderItems.length === 0) {
      return res.status(400).json({ success: false, error: 'Winkelmand is leeg.' });
    }

    try {
      // Zet kassa items om naar WooCommerce format
      const line_items = orderItems.map(item => ({
        product_id: parseInt(item.id),
        quantity: item.quantity,
        total: (parseFloat(item.price) * item.quantity).toFixed(2)
      }));

      // Bepaal betaalmethode label
      let paymentTitle = 'Kassa - PIN (SumUp)';
      if (paymentMethod === 'cash') paymentTitle = 'Kassa - Contant';
      if (paymentMethod === 'pin_manual') paymentTitle = 'Kassa - PIN Handmatig';

      const orderData = {
        payment_method: paymentMethod,
        payment_method_title: paymentTitle,
        set_paid: true,
        customer_id: customerId || 0,
        line_items: line_items,
        meta_data: [
          { key: 'pos_store_id', value: storeId || 1 },
          { key: 'pos_cashier_id', value: cashierId || 1 },
          { key: 'pos_cash_given', value: totals?.cashGiven || 0 },
          { key: 'pos_change_amount', value: totals?.changeAmount || 0 }
        ]
      };

      const response = await axios.post(`${siteUrl}/wp-json/wc/v3/orders`, orderData, {
        params: {
          consumer_key: consumerKey,
          consumer_secret: consumerSecret
        }
      });

      return res.status(200).json({
        success: true,
        orderId: response.data.id,
        order: response.data
      });

    } catch (error) {
      console.error('Fout bij aanmaken WooCommerce order:', error.response?.data || error.message);
      return res.status(500).json({ 
        success: false, 
        error: error.response?.data?.message || 'Fout bij opslaan van bestelling in WooCommerce.' 
      });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}