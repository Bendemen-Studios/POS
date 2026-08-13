// pages/api/woocommerce/products.js
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import axios from 'axios';

const api = new WooCommerceRestApi({
  url: process.env.WOO_SITE_URL,
  consumerKey: process.env.WOO_CONSUMER_KEY,
  consumerSecret: process.env.WOO_CONSUMER_SECRET,
  version: "wc/v3"
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  const { storeId } = req.query;

  if (!storeId) {
    return res.status(400).json({ success: false, error: "Geen winkel geselecteerd voor synchronisatie." });
  }

  try {
    const storesRes = await axios.get(`${process.env.WOO_SITE_URL}/wp-json/bendemen/v1/stores`);
    const stores = storesRes.data;
    const currentStore = stores.find(s => s.id === storeId);

    if (!currentStore) {
      return res.status(404).json({ success: false, error: "Geselecteerde winkel niet gevonden in WordPress." });
    }

    const categoryName = currentStore.category_name || `POS ${currentStore.name}`;

    const categoryResponse = await api.get("products/categories", {
      search: categoryName
    });

    let categoryId = null;
    if (categoryResponse.data && categoryResponse.data.length > 0) {
      const exactMatch = categoryResponse.data.find(cat => cat.name.toLowerCase() === categoryName.toLowerCase());
      categoryId = exactMatch ? exactMatch.id : categoryResponse.data[0].id;
    }

    if (!categoryId) {
      return res.status(404).json({ 
        success: false, 
        error: `WooCommerce categorie '${categoryName}' niet gevonden voor ${currentStore.name}.` 
      });
    }

    const response = await api.get("products", {
      category: categoryId,
      per_page: 100
    });

    const products = response.data.map(product => ({
      id: product.id,
      name: product.name,
      sku: product.sku,
      price: parseFloat(product.price) || 0,
      stock_quantity: product.stock_quantity || 0
    }));

    res.status(200).json({ success: true, products });
  } catch (error) {
    console.error("WooCommerce Products API Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Fout bij ophalen van producten uit WooCommerce' });
  }
}