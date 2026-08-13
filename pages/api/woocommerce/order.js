// pages/api/woocommerce/order.js
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

const api = new WooCommerceRestApi({
  url: process.env.WOO_SITE_URL,
  consumerKey: process.env.WOO_CONSUMER_KEY,
  consumerSecret: process.env.WOO_CONSUMER_SECRET,
  version: "wc/v3"
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { orderItems, paymentMethod, storeId, cashierId, customerId, totals } = req.body;

  try {
    const feeLines = [];

    if (totals.discountAmount > 0) {
      feeLines.push({
        name: 'Kassa Korting (Handmatig)',
        total: `-${totals.discountAmount.toFixed(2)}`,
        tax_class: ''
      });
    }

    if (totals.pointsDiscount > 0) {
      feeLines.push({
        name: 'Punten Ingewisseld',
        total: `-${totals.pointsDiscount.toFixed(2)}`,
        tax_class: ''
      });
    }

    let paymentTitle = 'Contant (Kassa)';
    if (paymentMethod === 'sumup') paymentTitle = 'Pin (SumUp)';
    if (paymentMethod === 'manual_pin') paymentTitle = 'Pin (Handmatig)';

    const orderData = {
      payment_method: paymentMethod === 'manual_pin' ? 'pin' : paymentMethod,
      payment_method_title: paymentTitle,
      set_paid: true,
      status: 'completed',
      customer_id: customerId || 0,
      
      line_items: orderItems.map(item => {
        const lineItem = {
          product_id: item.product_id || item.id,
          quantity: item.quantity
        };
        if (item.variation_id && item.variation_id > 0) {
          lineItem.variation_id = item.variation_id;
        }
        return lineItem;
      }),
      
      fee_lines: feeLines,
      
      meta_data: [
        { key: '_pos_store_id', value: storeId },
        { key: '_pos_cashier_id', value: cashierId },
        { key: '_created_via_bendemen_pos', value: 'yes' }
      ]
    };

    const response = await api.post("orders", orderData);
    const createdOrder = response.data;

    if (customerId > 0 && totals.pointsDiscount > 0 && totals.pointsUsed > 0) {
      const customerRes = await api.get(`customers/${customerId}`);
      const customer = customerRes.data;
      
      const pointsMeta = customer.meta_data.find(meta => meta.key === 'wc_points_balance');
      let currentPoints = pointsMeta ? parseInt(pointsMeta.value) : 0;
      
      let newPointsBalance = currentPoints - totals.pointsUsed;
      if (newPointsBalance < 0) newPointsBalance = 0;

      await api.put(`customers/${customerId}`, {
        meta_data: [{ key: 'wc_points_balance', value: newPointsBalance.toString() }]
      });
    }

    res.status(200).json({ success: true, orderId: createdOrder.id });

  } catch (error) {
    console.error("WooCommerce API Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Fout bij het aanmaken van de order in WooCommerce' });
  }
}