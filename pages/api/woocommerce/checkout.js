import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
  }

  const url = process.env.WOOCOMMERCE_URL || process.env.NEXT_PUBLIC_WOOCOMMERCE_URL || 'https://www.bendemen.com';
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOOCOMMERCE_KEY || process.env.NEXT_PUBLIC_WOOCOMMERCE_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOOCOMMERCE_SECRET || process.env.NEXT_PUBLIC_WOOCOMMERCE_SECRET;

  if (!consumerKey || !consumerSecret) {
    return res.status(500).json({
      success: false,
      error: 'WooCommerce API sleutels zijn niet geconfigureerd in .env'
    });
  }

  const { orderItems, paymentMethod, storeId, cashierId, customerId, totals, cashDetails, created_at } = req.body;

  const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const customHeaders = {
    'Authorization': authHeader,
    'Content-Type': 'application/json',
    'User-Agent': 'BDM-POS-Client/1.0 (Mozilla/5.0; Node.js)',
    'Connection': 'close'
  };

  try {
    const lineItems = [];
    const feeLines = [];

    // Verwerk winkelmand-items en scheid normale producten van custom items
    (orderItems || []).forEach((item) => {
      const pid = Number(item.product_id || item.id);
      const isCustomItem = !pid || isNaN(pid) || pid === 0 || String(item.id).startsWith('custom_');

      if (isCustomItem) {
        feeLines.push({
          name: item.name || item.title || 'Custom Artikel',
          total: (parseFloat(item.price || 0) * (item.quantity || 1)).toFixed(2),
          tax_class: '',
          tax_status: 'none'
        });
      } else {
        const lineObj = {
          product_id: pid,
          quantity: item.quantity || 1,
          total: (parseFloat(item.price || 0) * (item.quantity || 1)).toFixed(2)
        };

        if (item.variation_id && Number(item.variation_id) > 0) {
          lineObj.variation_id = Number(item.variation_id);
        }

        lineItems.push(lineObj);
      }
    });

    // Korting toevoegen
    if (totals?.discountAmount > 0) {
      feeLines.push({
        name: 'Handmatige Korting',
        total: `-${parseFloat(totals.discountAmount).toFixed(2)}`,
        tax_class: '',
        tax_status: 'none'
      });
    }

    const paymentTitle = paymentMethod === 'cash' 
      ? 'Contant (Kassa Direct)' 
      : (paymentMethod === 'manual_pin' ? 'Handmatige Pin (Kassa Direct)' : 'SumUp Pin (Kassa Direct)');

    const orderData = {
      payment_method: paymentMethod || 'pos_checkout',
      payment_method_title: paymentTitle,
      set_paid: true,
      status: 'completed',
      customer_id: customerId ? Number(customerId) : 0,
      line_items: lineItems,
      fee_lines: feeLines,
      meta_data: [
        { key: '_pos_store_id', value: String(storeId || 1) },
        { key: '_pos_cashier_id', value: String(cashierId || 1) },
        { key: '_pos_payment_type', value: String(paymentMethod) },
        { key: '_pos_direct_checkout', value: 'true' },
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

    // Directe Native Fetch call (snel & betrouwbaar)
    try {
      const fetchRes = await fetch(`${url}/wp-json/wc/v3/orders`, {
        method: 'POST',
        headers: customHeaders,
        body: JSON.stringify(orderData)
      });

      const responseText = await fetchRes.text();
      if (!fetchRes.ok) {
        throw new Error(`HTTP ${fetchRes.status}: ${responseText}`);
      }

      responseOrder = JSON.parse(responseText);
    } catch (fetchErr) {
      console.warn('[CHECKOUT API]: Native fetch faalt, probeert SDK fallback...', fetchErr.message);

      const api = new WooCommerceRestApi({
        url,
        consumerKey,
        consumerSecret,
        version: 'wc/v3',
        axiosConfig: {
          timeout: 20000,
          headers: customHeaders
        }
      });

      const { data } = await api.post('orders', orderData);
      responseOrder = data;
    }

    return res.status(200).json({ success: true, order: responseOrder });

  } catch (error) {
    console.error('[CHECKOUT API ERROR]:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Fout bij direct aanmaken van bestelling in WooCommerce.'
    });
  }
}