import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  // 1. Haal de omgevingsvariabelen op met fallbacks
  const wcUrl = process.env.WOOCOMMERCE_URL || process.env.NEXT_PUBLIC_WOOCOMMERCE_URL || 'https://www.bendemen.com';
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOOCOMMERCE_KEY || process.env.WC_CONSUMER_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOOCOMMERCE_SECRET || process.env.WC_CONSUMER_SECRET;

  // 2. Controleer direct op aanwezigheid van de keys vóór de SDK wordt gestart
  if (!consumerKey || !consumerSecret) {
    console.error('[MANUAL ORDER ERROR]: WooCommerce Key of Secret ontbreekt in process.env');
    return res.status(500).json({
      success: false,
      error: 'Serverconfiguratiefout: WooCommerce Consumer Key of Secret is niet geladen.'
    });
  }

  const { orderItems, paymentMethod, storeId, cashierId, customerId, totals, cashDetails, created_at } = req.body;

  try {
    // 3. Transformeer winkelmand items
    const lineItems = (orderItems || []).map((item) => {
      const isCustomItem = !item.product_id || item.product_id === 0 || String(item.id).startsWith('custom_');

      if (isCustomItem) {
        return {
          name: item.name || item.title || 'Custom Artikel',
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
      : (paymentMethod === 'manual_pin' ? 'Handmatige Pin (POS)' : 'Kassa Betaling (POS)');

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
        { key: '_pos_created_at', value: String(created_at || new Date().toISOString()) }
      ]
    };

    if (cashDetails && paymentMethod === 'cash') {
      orderData.meta_data.push(
        { key: '_pos_cash_given', value: String(cashDetails.cashGiven || 0) },
        { key: '_pos_change_due', value: String(cashDetails.changeDue || 0) }
      );
    }

    let responseOrder;

    // 4. Veilige SDK-initialisatie BINNEN de handler
    try {
      const WooCommerce = new WooCommerceRestApi({
        url: wcUrl,
        consumerKey: consumerKey,
        consumerSecret: consumerSecret,
        version: 'wc/v3',
      });

      const { data } = await WooCommerce.post('orders', orderData);
      responseOrder = data;
    } catch (sdkError) {
      console.warn('[MANUAL ORDER]: SDK aanroep mislukt, schakelt over naar native fetch fallback...', sdkError?.message);

      // Fallback: Directe HTTP Request via Native Fetch
      const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
      const fetchRes = await fetch(`${wcUrl}/wp-json/wc/v3/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify(orderData)
      });

      const fetchText = await fetchRes.text();

      if (!fetchRes.ok) {
        throw new Error(`WooCommerce HTTP ${fetchRes.status}: ${fetchText}`);
      }

      responseOrder = JSON.parse(fetchText);
    }

    return res.status(200).json({ success: true, order: responseOrder });

  } catch (error) {
    console.error('[MANUAL ORDER PROCESS ERROR]:', error?.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error?.response?.data?.message || error.message || 'Fout bij verwerken van de bestelling.'
    });
  }
}