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
    let keepFetching = true;

    // FASE 1: Alle producten ophalen
    while (keepFetching) {
      console.log(`[Sync] Pagina ${page} ophalen...`);
      
      const response = await api.get("products", { 
        per_page: 20, // Iets grotere batch, maar met minimale fields
        page: page,
        status: 'any', 
        _fields: 'id,name,price,sku,type,categories,images' 
      });

      if (response.data && response.data.length > 0) {
        allProducts.push(...response.data);
        page++;
      } else {
        keepFetching = false;
      }
    }

    console.log(`[Sync] Totaal ${allProducts.length} producten gevonden, nu details verwerken...`);

    const finalProducts = [];

    // FASE 2: Producten verwerken
    for (const product of allProducts) {
      try {
        let imageUrl = product.images?.[0]?.src || null;
        let mainCategory = product.categories?.[0]?.name || 'Overig';

        if (product.type === 'variable') {
          // Variaties ophalen
          const varRes = await api.get(`products/${product.id}/variations`, { 
            per_page: 50,
            _fields: 'id,attributes,sku,price,image'
          });

          const variations = (varRes.data || []).map(variation => ({
            id: variation.id,
            product_id: product.id,
            variation_id: variation.id,
            name: (variation.attributes || []).map(a => a.option).join(', ') || 'Variatie',
            sku: variation.sku || product.sku,
            price: parseFloat(variation.price) || 0,
            image: variation.image?.src || imageUrl,
          }));

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
      } catch (err) {
        console.error(`[Sync Fout] Product ${product.id} mislukt:`, err.message);
        // We gaan gewoon door met het volgende product
      }
    }

    res.status(200).json({ success: true, count: finalProducts.length, products: finalProducts });
  } catch (error) {
    console.error("[Sync Fatal Error]:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}