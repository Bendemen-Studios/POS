import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const url = process.env.WOOCOMMERCE_URL || process.env.NEXT_PUBLIC_WOOCOMMERCE_URL || 'https://www.bendemen.com';
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.NEXT_PUBLIC_WOOCOMMERCE_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.NEXT_PUBLIC_WOOCOMMERCE_SECRET;

  if (!consumerKey || !consumerSecret) {
    return res.status(500).json({
      success: false,
      error: 'WooCommerce API sleutels zijn niet geconfigureerd in .env'
    });
  }

  const api = new WooCommerceRestApi({
    url,
    consumerKey,
    consumerSecret,
    version: 'wc/v3'
  });

  try {
    const { data: rawProducts } = await api.get('products', {
      per_page: 100,
      status: 'publish'
    });

    const products = await Promise.all(
      rawProducts.map(async (product) => {
        let variationsData = [];

        // Als het een variabel product is, haal de variatie-details (met ID & Attributen) op
        if (product.type === 'variable' && Array.isArray(product.variations) && product.variations.length > 0) {
          try {
            const { data: variations } = await api.get(`products/${product.id}/variations`, {
              per_page: 100
            });

            variationsData = variations.map((v) => ({
              id: v.id,
              variation_id: v.id,
              price: v.price || v.regular_price || 0,
              regular_price: v.regular_price || 0,
              sale_price: v.sale_price || null,
              stock_quantity: v.stock_quantity,
              in_stock: v.in_stock ?? v.stock_status === 'instock',
              attributes: Array.isArray(v.attributes)
                ? v.attributes.map((attr) => ({
                    id: attr.id,
                    name: attr.name,
                    option: attr.option
                  }))
                : []
            }));
          } catch (varErr) {
            console.error(`Fout bij ophalen variaties voor product #${product.id}:`, varErr.message);
          }
        }

        return {
          id: product.id,
          name: product.name,
          slug: product.slug,
          price: product.price || product.regular_price || 0,
          regular_price: product.regular_price || 0,
          sale_price: product.sale_price || null,
          stock_quantity: product.stock_quantity,
          in_stock: product.in_stock ?? product.stock_status === 'instock',
          type: product.type,
          categories: Array.isArray(product.categories)
            ? product.categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))
            : [],
          images: Array.isArray(product.images)
            ? product.images.map((img) => ({ id: img.id, src: img.src, alt: img.alt }))
            : [],
          attributes: product.attributes || [],
          variations: product.variations || [],
          variations_data: variationsData
        };
      })
    );

    return res.status(200).json({
      success: true,
      count: products.length,
      products
    });
  } catch (error) {
    console.error('Fout bij ophalen WooCommerce producten:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message || 'Fout bij ophalen producten'
    });
  }
}