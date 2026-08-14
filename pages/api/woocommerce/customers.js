import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

const WooCommerce = WooCommerceRestApi.default || WooCommerceRestApi;

const api = new WooCommerce({
  url: process.env.WOO_SITE_URL || process.env.WOOCOMMERCE_URL || "https://www.bendemen.com",
  consumerKey: process.env.WOO_CONSUMER_KEY,
  consumerSecret: process.env.WOO_CONSUMER_SECRET,
  version: "wc/v3"
});

export default async function handler(req, res) {
  try {
    const response = await api.get("customers", { per_page: 100 });
    return res.status(200).json({
      success: true,
      customers: response.data || []
    });
  } catch (error) {
    console.error("WooCommerce Customers Fetch Error:", error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
}