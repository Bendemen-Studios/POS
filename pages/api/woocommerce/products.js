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

    for (const product of response.data) {
      // Categorie ophalen
      let mainCategory = 'Overig';
      if (product.categories && product.categories.length > 0) {
        mainCategory = product.categories[0].name || 'Overig';
      }

      // Afbeelding ophalen
      let imageUrl = null;
      if (product.images && product.images.length > 0) {
        imageUrl = product.images[0].src || null;
      }

      if (product.type === 'variable') {
        try {
          const varRes = await api.get(`products/${product.id}/variations`, { per_page: 100, status: 'any' });
          const variations = (varRes.data || []).map(variation => {
            const attrString = (variation.attributes || []).map(a => a.option).join(', ');
            let varImage = imageUrl;
            if (variation.image && variation.image.src) {
              varImage = variation.image.src;
            }
            
            return {
              id: variation.id,
              product_id: product.id,
              variation_id: variation.id,
              name: attrString || variation.name,
              sku: variation.sku || product.sku,
              price: parseFloat(variation.price) || 0,
              image: varImage,
            };
          });

          finalProducts.push({
            id: product.id,
            product_id: product.id,
            variation_id: 0,
            name: product.name,
            sku: product.sku,
            price: parseFloat(product.price) || 0,
            image: imageUrl,
            categoryName: mainCategory,
            type: 'variable',
            variations: variations
          });
        } catch (err) {
          // Fallback als variaties ophalen faalt
          finalProducts.push({
            id: product.id,
            product_id: product.id,
            variation_id: 0,
            name: product.name,
            sku: product.sku,
            price: parseFloat(product.price) || 0,
            image: imageUrl,
            categoryName: mainCategory,
            type: 'simple',
            variations: []
          });
        }
      } else {
        finalProducts.push({
          id: product.id,
          product_id: product.id,
          variation_id: 0,
          name: product.name,
          sku: product.sku,
          price: parseFloat(product.price) || 0,
          image: imageUrl,
          categoryName: mainCategory,
          type: 'simple',
          variations: []
        });
      }
    }

    res.status(200).json({ success: true, products: finalProducts });
  } catch (error) {
    console.error("WooCommerce API Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Fout bij ophalen van producten via WooCommerce API' });
  }
}