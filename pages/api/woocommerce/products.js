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
    let allProducts = [];
    let page = 1;

    // --- ROBUUSTE PAGINERING LOOP (Blijft doorgaan tot de API leeg is) ---
    while (true) {
      const response = await api.get("products", { 
        per_page: 100,
        page: page,
        status: 'any' 
      });

      if (!response.data || response.data.length === 0) {
        break; // Geen producten meer, klaar met loopen
      }

      allProducts.push(...response.data);

      // Als deze pagina minder dan 100 items bevat, is dit sowieso de laatste pagina
      if (response.data.length < 100) {
        break;
      }

      page++;
    }

    const finalProducts = [];

    for (const product of allProducts) {
      // Prioriteit voor subcategorieën (zoals Barks)
      let mainCategory = 'Overig';
      if (product.categories && product.categories.length > 0) {
        const specificCategory = product.categories.find(cat => cat.parent && cat.parent > 0) || product.categories[0];
        mainCategory = specificCategory.name || specificCategory.slug || 'Overig';
      }

      let imageUrl = null;
      if (product.images && product.images.length > 0) {
        imageUrl = product.images[0].src || null;
      }

      if (product.type === 'variable') {
        try {
          let allVariations = [];
          let varPage = 1;

          // --- ROBUUSTE VARIATIE LOOP ---
          while (true) {
            const varRes = await api.get(`products/${product.id}/variations`, { 
              per_page: 100, 
              page: varPage,
              status: 'any' 
            });

            if (!varRes.data || varRes.data.length === 0) {
              break;
            }

            allVariations.push(...varRes.data);

            if (varRes.data.length < 100) {
              break;
            }

            varPage++;
          }

          const variations = allVariations.map(variation => {
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

    res.status(200).json({ success: true, count: finalProducts.length, products: finalProducts });
  } catch (error) {
    console.error("WooCommerce API Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Fout bij ophalen van producten via WooCommerce API' });
  }
}