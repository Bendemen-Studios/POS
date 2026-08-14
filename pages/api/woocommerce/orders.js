import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

const WooCommerce = WooCommerceRestApi.default || WooCommerceRestApi;

const api = new WooCommerce({
  url: process.env.WOO_SITE_URL || process.env.WOOCOMMERCE_URL || "https://www.bendemen.com",
  consumerKey: process.env.WOO_CONSUMER_KEY,
  consumerSecret: process.env.WOO_CONSUMER_SECRET,
  version: "wc/v3"
});

export default async function handler(req, res) {
  // GET: Alle bestellingen ophalen met paginering
  if (req.method === 'GET') {
    try {
      let allOrders = [];
      let page = 1;
      let totalPages = 1;

      do {
        const response = await api.get("orders", {
          per_page: 50,
          page: page,
          orderby: "date",
          order: "desc"
        });

        const orders = response.data || [];
        allOrders = allOrders.concat(orders);

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

  // PUT: Status van een specifieke bestelling aanpassen
  if (req.method === 'PUT') {
    try {
      const { id, status } = req.body;

      if (!id || !status) {
        return res.status(400).json({ success: false, message: 'Order ID en status zijn verplicht.' });
      }

      const response = await api.put(`orders/${id}`, { status });

      return res.status(200).json({ 
        success: true, 
        message: 'Bestelling status succesvol bijgewerkt!',
        order: response.data 
      });
    } catch (error) {
      console.error("WooCommerce Order Update Error:", error.response?.data || error.message);
      return res.status(500).json({ 
        success: false, 
        error: error.response?.data?.message || error.message || 'Fout bij bijwerken bestelling status' 
      });
    }
  }

  res.setHeader('Allow', ['GET', 'PUT']);
  return res.status(405).json({ success: false, message: `Method ${req.method} not allowed` });
}