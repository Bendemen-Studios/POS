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
    const { cart, total, amountGiven, change, storeName } = req.body;

    // Omzetten van winkelmand items naar WooCommerce order line_items formaat
    const line_items = cart.map(item => ({
      product_id: item.id || item.product_id,
      variation_id: item.variation_id || 0,
      quantity: 1 // Je kunt dit uitbreiden als je met aantallen werkt
    }));

    const orderData = {
      payment_method: "pos_cash",
      payment_method_title: `Contant Kassa (${storeName || 'Bendemen POS'})`,
      set_paid: true, // Direct op afgerond/betaald zetten in WooCommerce
      line_items: line_items,
      meta_data: [
        { key: "_pos_amount_given", value: String(amountGiven) },
        { key: "_pos_change", value: String(change) }
      ]
    };

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