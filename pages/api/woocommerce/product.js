// pages/api/woocommerce/products.js
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

const api = new WooCommerceRestApi({
  url: process.env.WOO_SITE_URL, // Bijv: https://bendemen.nl
  consumerKey: process.env.WOO_CONSUMER_KEY,
  consumerSecret: process.env.WOO_CONSUMER_SECRET,
  version: "wc/v3"
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  try {
    // Haal actieve producten op (inclusief prijs en voorraad status)
    // Let op: Bij meer dan 100 producten moet je later paginatie (pages) toevoegen
    const response = await api.get("products", {
      per_page: 100,
      status: "publish" 
    });

    // We filteren de data zodat we niet te veel overbodige info naar de frontend sturen
    const formattedProducts = response.data.map(product => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      price: parseFloat(product.price || 0),
      stock_quantity: product.stock_quantity,
      image: product.images.length > 0 ? product.images[0].src : null
    }));

    res.status(200).json({ success: true, products: formattedProducts });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Fout bij ophalen WooCommerce producten' });
  }
}