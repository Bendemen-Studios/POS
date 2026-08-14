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
    let allOrders = [];
    let page = 1;
    let totalPages = 1;

    // Loop automatisch door alle pagina's heen (per 50 stuks) totdat alle bestellingen binnen zijn
    do {
      const response = await api.get("orders", {
        per_page: 50,
        page: page,
        orderby: "date",
        order: "desc"
      });

      const orders = response.data || [];
      allOrders = allOrders.concat(orders);

      // WooCommerce stuurt de totale hoeveelheid pagina's mee in de response headers
      const totalPagesHeader = response.headers['x-wp-totalpages'];
      totalPages = totalPagesHeader ? parseInt(totalPagesHeader, 10) : 1;

      page++;
    } while (page <= totalPages);

    return res.status(200).json({ 
      success: true, 
      orders: allOrders 
    });
  } catch (error) {
    console.error("WooCommerce Orders Fetch Error:", error.response?.data || error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.response?.data?.message || error.message || 'Fout bij ophalen bestellingen' 
    });
  }
}