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
    // 1. Bouw de kassabonnen-regels op voor korting en punten (Fee Lines)
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

    // 2. Bouw de complete order data op
    const orderData = {
      payment_method: paymentMethod, // 'cash' of 'sumup'
      payment_method_title: paymentMethod === 'cash' ? 'Contant (Kassa)' : 'Pin (SumUp)',
      set_paid: true,
      status: 'completed', // Bestelling is direct afgerond
      customer_id: customerId || 0,
      
      // Voeg de producten toe
      line_items: orderItems.map(item => ({
        product_id: item.id,
        quantity: item.quantity
      })),
      
      // Voeg de kortingen toe
      fee_lines: feeLines,
      
      // Extra Bendemen POS metadata
      meta_data: [
        { key: '_pos_store_id', value: storeId },
        { key: '_pos_cashier_id', value: cashierId },
        { key: '_created_via_bendemen_pos', value: 'yes' }
      ]
    };

    // 3. Stuur de order naar WooCommerce
    const response = await api.post("orders", orderData);
    const createdOrder = response.data;

    // 4. Punten afschrijven bij de klant
    if (customerId > 0 && totals.pointsDiscount > 0) {
      const customerRes = await api.get(`customers/${customerId}`);
      const customer = customerRes.data;
      
      const pointsMeta = customer.meta_data.find(meta => meta.key === 'wc_points_balance');
      let currentPoints = pointsMeta ? parseInt(pointsMeta.value) : 0;
      
      const pointsDeducted = Math.round(totals.pointsDiscount / 0.05);
      let newPointsBalance = currentPoints - pointsDeducted;
      
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