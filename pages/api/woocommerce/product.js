// pages/api/woocommerce/products.js
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

const api = new WooCommerceRestApi({
  url: process.env.WOO_SITE_URL,
  consumerKey: process.env.WOO_CONSUMER_KEY,
  consumerSecret: process.env.WOO_CONSUMER_SECRET,
  version: "wc/v3"
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  try {
    // Haal alle producten op inclusief verborgen/private items en categorieën
    const response = await api.get("products", { 
      per_page: 100,
      status: 'any' 
    });
    
    const finalProducts = [];
    const variationPromises = [];

    for (const product of response.data) {
      // Haal de categorie naam op uit het product object
      const productCategories = product.categories || [];
      const mainCategory = productCategories.length > 0 ? (productCategories[0].name || 'Overig') : 'Overig';
      
      // Hoofdafbeelding ophalen
      const imageUrl = (product.images && product.images.length > 0 && product.images[0].src) ? product.images[0].src : null;

      if (product.type === 'variable') {
        const promise = api.get(`products/${product.id}/variations`, { per_page: 100, status: 'any' })
          .then(varRes => {
            return varRes.data.map(variation => {
              const attrString = variation.attributes.map(a => a.option).join(', ');
              const varImage = (variation.image && variation.image.src) ? variation.image.src : imageUrl;
              
              return {
                id: variation.id,
                product_id: product.id,
                variation_id: variation.id,
                name: `${product.name} ${attrString ? `- ${attrString}` : ''}`.trim(),
                sku: variation.sku || product.sku,
                price: parseFloat(variation.price) || 0,
                image: varImage,
                categoryName: mainCategory
              };
            });
          })
          .catch(err => []);
        variationPromises.push(promise);
      } else {
        finalProducts.push({
          id: product.id,
          product_id: product.id,
          variation_id: 0,
          name: product.name,
          sku: product.sku,
          price: parseFloat(product.price) || 0,
          image: imageUrl,
          categoryName: mainCategory
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