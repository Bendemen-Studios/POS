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
      feeLines.push({ name: 'Kassa Korting (Handmatig)', total: `-${totals.discountAmount.toFixed(2)}` });
    }

    if (totals.pointsDiscount > 0) {
      feeLines.push({ name: 'Punten Ingewisseld', total: `-${totals.pointsDiscount.toFixed(2)}` });
    }

    let paymentTitle = paymentMethod === 'sumup' ? 'Pin (SumUp)' : paymentMethod === 'manual_pin' ? 'Pin (Handmatig)' : 'Contant (Kassa)';

    const orderData = {
      payment_method: paymentMethod === 'manual_pin' ? 'pin' : paymentMethod,
      payment_method_title: paymentTitle,
      set_paid: true,
      status: 'completed',
      customer_id: customerId || 0,
      line_items: orderItems.map(item => ({
        product_id: item.product_id || item.id,
        variation_id: item.variation_id || 0,
        quantity: item.quantity || 1
      })),
      fee_lines: feeLines,
      meta_data: [
        { key: '_pos_store_id', value: storeId },
        { key: '_pos_cashier_id', value: cashierId },
        { key: '_created_via_bendemen_pos', value: 'yes' }
      ]
    };

    const response = await api.post("orders", orderData);
    const createdOrder = response.data;

    // Punten logica
    if (customerId > 0) {
      const customerRes = await api.get(`customers/${customerId}`);
      const customer = customerRes.data;
      const pointsMeta = customer.meta_data.find(meta => meta.key === 'wc_points_balance');
      let currentPoints = pointsMeta ? parseInt(pointsMeta.value) : 0;

      // Inwisselen aftrekken
      let pointsBalance = currentPoints - (totals.pointsUsed || 0);
      if (pointsBalance < 0) pointsBalance = 0;

      // Sparen: 1 punt per 1 euro
      const earnedPoints = Math.floor(parseFloat(totals.totalPaid));
      pointsBalance += earnedPoints;

      await api.put(`customers/${customerId}`, {
        meta_data: [{ key: 'wc_points_balance', value: pointsBalance.toString() }]
      });
    }

    res.status(200).json({ success: true, orderId: createdOrder.id });
  } catch (error) {
    console.error("WooCommerce API Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Fout bij aanmaken order' });
  }
}