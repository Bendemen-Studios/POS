import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

const api = new WooCommerceRestApi({
  url: process.env.WOO_SITE_URL,
  consumerKey: process.env.WOO_CONSUMER_KEY,
  consumerSecret: process.env.WOO_CONSUMER_SECRET,
  version: "wc/v3"
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  try {
    let page = 1;
    let allProducts = [];
    let totalPages = 1;

    do {
      const response = await api.get("products", {
        per_page: 50,
        page: page,
        status: "publish"
      });

      const products = response.data;
      allProducts = [...allProducts, ...products];

      totalPages = parseInt(response.headers["x-wp-totalpages"] || "1", 10);
      page++;

      // Wacht 200ms voor de volgende pagina om 503-blokkades te voorkomen
      if (page <= totalPages) {
        await sleep(200);
      }

    } while (page <= totalPages);

    res.status(200).json(allProducts);
  } catch (error) {
    console.error("Products API Error:", error.response?.data || error.message);
    res.status(500).json({ error: "Fout bij ophalen van producten uit WooCommerce" });
  }
}