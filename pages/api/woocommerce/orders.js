import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

const WooCommerce = WooCommerceRestApi.default || WooCommerceRestApi;

const api = new WooCommerce({
  url: process.env.WOO_SITE_URL || process.env.WOOCOMMERCE_URL || "https://www.bendemen.com",
  consumerKey: process.env.WOO_CONSUMER_KEY,
  consumerSecret: process.env.WOO_CONSUMER_SECRET,
  version: "wc/v3"
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, message: `Method ${req.method} not allowed` });
  }

  try {
    // Haal de laatste orders op uit WooCommerce
    const response = await api.get("orders", {
      per_page: 50,
      orderby: "date",
      order: "desc"
    });

    return res.status(200).json({ 
      success: true, 
      orders: response.data 
    });
  } catch (error) {
    console.error("WooCommerce Orders Fetch Error:", error.response?.data || error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.response?.data?.message || error.message || 'Fout bij ophalen bestellingen' 
    });
  }
}