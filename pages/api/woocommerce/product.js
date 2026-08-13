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
    const categoryResponse = await api.get("products/categories", { search: categoryName });

    let categoryId = null;
    if (categoryResponse.data && categoryResponse.data.length > 0) {
      const exactMatch = categoryResponse.data.find(cat => cat.name.toLowerCase() === categoryName.toLowerCase());
      categoryId = exactMatch ? exactMatch.id : categoryResponse.data[0].id;
    }

    if (!categoryId) return res.status(404).json({ success: false, error: `Categorie '${categoryName}' niet gevonden.` });

    // 2. Haal de hoofdproducten op uit deze categorie
    const response = await api.get("products", { category: categoryId, per_page: 100 });
    
    const finalProducts = [];
    const variationPromises = [];

    // 3. Loop door alle producten. Als het variabel is, haal de variaties op.
    for (const product of response.data) {
      if (product.type === 'variable') {
        // Maak een snelle asynchrone call voor de variaties
        const promise = api.get(`products/${product.id}/variations`, { per_page: 100 })
          .then(varRes => {
            return varRes.data.map(variation => {
              // Combineer de attributen (zoals "Zwart - XL")
              const attrString = variation.attributes.map(a => a.option).join(', ');
              return {
                id: variation.id,                   // Unieke ID voor de cart
                product_id: product.id,             // Hoofd ID (voor WooCommerce)
                variation_id: variation.id,         // Variatie ID (voor WooCommerce)
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
        // Simpel product
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

    // Wacht tot alle variaties tegelijk zijn ingeladen (supersnel)
    const resolvedVariations = await Promise.all(variationPromises);
    resolvedVariations.forEach(vars => finalProducts.push(...vars));

    res.status(200).json({ success: true, products: finalProducts });
  } catch (error) {
    console.error("WooCommerce API Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Fout bij ophalen van producten uit WooCommerce' });
  }
}