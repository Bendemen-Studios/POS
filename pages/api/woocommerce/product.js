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
  if (!storeId) return res.status(400).json({ success: false, error: "Geen winkel geselecteerd." });

  try {
    // 1. Haal de categorie naam op voor de actieve winkel
    const storesRes = await axios.get(`${process.env.WOO_SITE_URL}/wp-json/bendemen/v1/stores`);
    const currentStore = storesRes.data.find(s => s.id === storeId);

    if (!currentStore) return res.status(404).json({ success: false, error: "Winkel niet gevonden." });

    const categoryName = currentStore.category_name || `POS ${currentStore.name}`;
    
    // 2. Zoek de categorie in WooCommerce
    const categoryResponse = await api.get("products/categories", { search: categoryName });

    let categoryId = null;
    if (categoryResponse.data && categoryResponse.data.length > 0) {
      // Dwing een EXACTE naammatch af (hoofdletterongevoelig)
      const exactMatch = categoryResponse.data.find(cat => cat.name.toLowerCase() === categoryName.toLowerCase());
      if (exactMatch) {
        categoryId = exactMatch.id;
      }
    }

    // Als er geen exacte match is, stoppen we direct met een foutmelding
    if (!categoryId) {
      return res.status(404).json({ 
        success: false, 
        error: `Exacte WooCommerce categorie '${categoryName}' niet gevonden. Maak deze categorie aan in WooCommerce of controleer de spelling.` 
      });
    }

    // 3. Haal de hoofdproducten op uit deze specifieke categorie
    const response = await api.get("products", { category: categoryId, per_page: 100 });
    
    const finalProducts = [];
    const variationPromises = [];

    for (const product of response.data) {
      if (product.type === 'variable') {
        const promise = api.get(`products/${product.id}/variations`, { per_page: 100 })
          .then(varRes => {
            return varRes.data.map(variation => {
              const attrString = variation.attributes.map(a => a.option).join(', ');
              return {
                id: variation.id,
                product_id: product.id,
                variation_id: variation.id,
                name: `${product.name} ${attrString ? `- ${attrString}` : ''}`.trim(),
                sku: variation.sku || product.sku,
                price: parseFloat(variation.price) || 0,
              };
            });
          })
          .catch(err => {
            console.error(`Fout bij variaties voor product ${product.id}`, err.message);
            return [];
          });
        variationPromises.push(promise);
      } else {
        finalProducts.push({
          id: product.id,
          product_id: product.id,
          variation_id: 0,
          name: product.name,
          sku: product.sku,
          price: parseFloat(product.price) || 0,
        });
      }
    }

    const resolvedVariations = await Promise.all(variationPromises);
    resolvedVariations.forEach(vars => finalProducts.push(...vars));

    res.status(200).json({ success: true, products: finalProducts });
  } catch (error) {
    console.error("WooCommerce API Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Fout bij ophalen van producten uit WooCommerce' });
  }
}