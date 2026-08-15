import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';

const WooCommerce = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL || process.env.NEXT_PUBLIC_WOOCOMMERCE_URL || 'https://www.bendemen.com',
  consumerKey: process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOOCOMMERCE_KEY,
  consumerSecret: process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOOCOMMERCE_SECRET,
  version: 'wc/v3',
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const { orderItems, paymentMethod, storeId, cashierId, customerId, totals, cashDetails } = req.body;

  try {
    // Transformeer winkelmand items naar het formaat dat WooCommerce vereist
    const lineItems = (orderItems || []).map((item) => {
      const isCustomItem = !item.product_id || item.product_id === 0 || String(item.id).startsWith('custom_');

      if (isCustomItem) {
        return {
          name: item.name || 'Custom Artikel',
          total: parseFloat(item.price || 0).toFixed(2),
          quantity: item.quantity || 1,
        };
      }

      const lineItemObj = {
        product_id: Number(item.product_id || item.id),
        quantity: item.quantity || 1,
        total: (parseFloat(item.price || 0) * (item.quantity || 1)).toFixed(2)
      };

      if (item.variation_id && item.variation_id !== 0) {
        lineItemObj.variation_id = Number(item.variation_id);
      }

      return lineItemObj;
    });

    const paymentTitle = paymentMethod === 'cash' 
      ? 'Contante Betaling (POS)' 
      : (paymentMethod === 'manual_pin' ? 'Handmatige Pin (POS)' : 'Kassa Betaling');

    const orderData = {
      payment_method: paymentMethod || 'pos_manual',
      payment_method_title: paymentTitle,
      set_paid: true,
      status: 'completed',
      customer_id: customerId ? Number(customerId) : 0,
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
        { key: '_pos_payment_type', value: String(paymentMethod) },
      ]
    };

    if (cashDetails && paymentMethod === 'cash') {
      orderData.meta_data.push(
        { key: '_pos_cash_given', value: String(cashDetails.cashGiven) },
        { key: '_pos_change_due', value: String(cashDetails.changeDue) }
      );
    }

    const { data: responseOrder } = await WooCommerce.post('orders', orderData);

    return res.status(200).json({ success: true, order: responseOrder });
  } catch (error) {
    console.error('WooCommerce Manual Order Error:', error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error?.response?.data?.message || error.message || 'Fout bij verwerken van handmatige bestelling.'
    });
  }
}