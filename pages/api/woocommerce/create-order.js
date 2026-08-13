import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

const api = new WooCommerceRestApi({
  url: process.env.WOO_SITE_URL,
  consumerKey: process.env.WOO_CONSUMER_KEY,
  consumerSecret: process.env.WOO_CONSUMER_SECRET,
  version: "wc/v3"
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { 
      items, 
      total, 
      subtotal, 
      discount, 
      paymentMethod, 
      storeId, 
      storeName, 
      customerId, 
      redeemPoints, 
      pointsToRedeem 
    } = req.body;

    // 1. Correct omzetten van winkelmand items inclusief werkelijke aantallen
    const line_items = items.map(item => ({
      product_id: item.id || item.product_id,
      variation_id: item.variation_id || 0,
      quantity: item.quantity || 1
    }));

    // 2. Bepaal betaalmethode titels
    const isSumUp = paymentMethod === 'sumup';
    const payment_method = isSumUp ? "sumup_pos" : "pos_cash";
    const payment_method_title = isSumUp 
      ? `SumUp Pin (${storeName || storeId || 'Bendemen POS'})` 
      : `Contant Kassa (${storeName || storeId || 'Bendemen POS'})`;

    // 3. Optionele korting toevoegen als negatieve fee als er een korting is toegepast
    const fee_lines = [];
    if (discount && discount > 0) {
      fee_lines.push({
        name: "POS Korting",
        total: `-${parseFloat(discount).toFixed(2)}`
      });
    }

    // 4. Bouw WooCommerce order data op
    const orderData = {
      payment_method: payment_method,
      payment_method_title: payment_method_title,
      set_paid: true,
      customer_id: customerId ? parseInt(customerId) : 0,
      line_items: line_items,
      fee_lines: fee_lines,
      meta_data: [
        { key: "_pos_store_id", value: String(storeId || 'store_ons_winkeltje') },
        { key: "_pos_payment_type", value: String(paymentMethod || 'cash') },
        { key: "_pos_redeemed_points", value: String(redeemPoints ? pointsToRedeem : 0) }
      ]
    };

    // Indien punten worden ingewisseld, kun je dit via meta of specifieke plugins doorgeven
    if (redeemPoints && pointsToRedeem > 0) {
      orderData.meta_data.push({
        key: "_wc_points_redeemed",
        value: String(pointsToRedeem)
      });
    }

    const response = await api.post("orders", orderData);
    
    res.status(200).json({ success: true, orderId: response.data.id });
  } catch (error) {
    console.error("WooCommerce Order Error:", error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      error: error.response?.data?.message || error.message 
    });
  }
}