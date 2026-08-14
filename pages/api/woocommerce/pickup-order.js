import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

const api = new WooCommerceRestApi({
  url: process.env.WOOCOMMERCE_URL,
  consumerKey: process.env.WOO_CONSUMER_KEY,
  consumerSecret: process.env.WOO_CONSUMER_SECRET,
  version: "wc/v3"
});

export default async function handler(req, res) {
  try {
    const response = await api.get("orders", { status: "processing,on-hold" });
    // Filter op Local Pickup Plus orders
    const pickupOrders = response.data.filter(o => 
      o.shipping_lines?.some(s => s.method_id === 'local_pickup_plus')
    );
    res.status(200).json({ success: true, orders: pickupOrders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}