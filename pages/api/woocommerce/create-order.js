import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

// Ondersteun zowel WOO_SITE_URL als WOOCOMMERCE_URL als fallback
const WooCommerce = WooCommerceRestApi.default || WooCommerceRestApi;

const api = new WooCommerce({
  url: process.env.WOO_SITE_URL || process.env.WOOCOMMERCE_URL,
  consumerKey: process.env.WOO_CONSUMER_KEY,
  consumerSecret: process.env.WOO_CONSUMER_SECRET,
  version: "wc/v3"
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ success: false, message: `Method ${req.method} not allowed` });
  }

  try {
    const orderData = req.body;

    // Validatie of er wel productitems zijn meegeleverd
    if (!orderData || !orderData.line_items || orderData.line_items.length === 0) {
      return res.status(400).json({ success: false, error: 'Geen producten gevonden in de bestelling.' });
    }

    // Stuur de bestelling door naar de WooCommerce REST API van www.bendemen.com
    const response = await api.post("orders", orderData);

    return res.status(200).json({
      success: true,
      order: response.data
    });

  } catch (error) {
    console.error("WooCommerce Create Order Error:", error.response?.data || error.message);
    
    return res.status(500).json({ 
      success: false, 
      error: error.response?.data?.message || error.message || 'Fout bij aanmaken van bestelling in WooCommerce' 
    });
  }
}