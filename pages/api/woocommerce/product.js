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
    const response = await api.get("products", { 
      per_page: 100,
      status: 'any' 
    });
    
    const finalProducts = [];
    const variationPromises = [];

    for (const product of response.data) {
      // 1. Veilige categorie extractie
      let mainCategory = 'Overig';
      if (product.categories && Array.isArray(product.categories) && product.categories.length > 0) {
        mainCategory = product.categories[0].name || product.categories[0].slug || 'Overig';
      }

      // 2. Veilige hoofdafbeelding extractie
      let imageUrl = null;
      if (product.images && Array.isArray(product.images) && product.images.length > 0) {
        imageUrl = product.images[0].src || null;
      }

      if (product.type === 'variable') {
        const promise = api.get(`products/${product.id}/variations`, { per_page: 100, status: 'any' })
          .then(varRes => {
            return (varRes.data || []).map(variation => {
              const attrString = (variation.attributes || []).map(a => a.option).join(', ');
              
              // Variatie foto of fallback naar hoofdproduct foto
              let varImage = imageUrl;
              if (variation.image && variation.image.src) {
                varImage = variation.image.src;
              }
              
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
          .catch(err => {
            console.error(`Fout bij variaties van product ${product.id}:`, err.message);
            return [];
          });
        
        variationPromises.push(
          promise.then(variations => {
            if (variations.length > 0) {
              finalProducts.push(...variations);
            } else {
              // Fallback als variaties falen
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
          })
        );
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

    await Promise.all(variationPromises);

    res.status(200).json({ success: true, count: finalProducts.length, products: finalProducts });
  } catch (error) {
    console.error("WooCommerce API Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Fout bij ophalen van producten uit WooCommerce' });
  }
}