import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';

const WooCommerce = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL || 'https://www.bendemen.com',
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET,
  version: 'wc/v3',
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { orderItems, paymentMethod, storeId, cashierId, customerId, totals, cashDetails } = req.body;

  try {
    const lineItems = orderItems.map((item) => {
      // Custom artikel afhandeling
      if (!item.product_id || item.product_id === 0 || String(item.id).startsWith('custom_')) {
        return {
          name: item.name || 'Custom Artikel',
          total: parseFloat(item.price).toFixed(2),
          quantity: item.quantity,
        };
      }

      const lineItemObj = {
        product_id: item.product_id,
        quantity: item.quantity,
        total: (parseFloat(item.price) * item.quantity).toFixed(2)
      };

      if (item.variation_id && item.variation_id !== 0) {
        lineItemObj.variation_id = item.variation_id;
      }

      return lineItemObj;
    });

    const paymentTitle = paymentMethod === 'cash' 
      ? 'Contante Betaling (POS)' 
      : (paymentMethod === 'manual_pin' ? 'Handmatige Pin (POS)' : 'Kassa Betaling (POS)');

    const orderData = {
      payment_method: paymentMethod || 'pos_manual',
      payment_method_title: paymentTitle,
      set_paid: true,
      status: 'completed',
      customer_id: customerId ? parseInt(customerId) : 0,
      line_items: lineItems,
      fee_lines: totals?.discountAmount > 0 ? [
        {
          name: 'Handmatige Korting',
          total: `-${parseFloat(totals.discountAmount).toFixed(2)}`,
          tax_class: '',
          tax_status: 'none'
        }
      ] : [],
      meta_data: [
        { key: '_pos_store_id', value: String(storeId || 1) },
        { key: '_pos_cashier_id', value: String(cashierId || 1) },
        { key: '_pos_payment_type', value: String(paymentMethod) }
      ]
    };

    if (cashDetails && paymentMethod === 'cash') {
      orderData.meta_data.push(
        { key: '_pos_cash_given', value: String(cashDetails.cashGiven || 0) },
        { key: '_pos_change_due', value: String(cashDetails.changeDue || 0) }
      );
    }

    const response = await WooCommerce.post('orders', orderData);

    res.status(200).json({ success: true, order: response.data });
  } catch (error) {
    console.error('WooCommerce API Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Fout bij aanmaken van de bestelling in WooCommerce' });
  }
}