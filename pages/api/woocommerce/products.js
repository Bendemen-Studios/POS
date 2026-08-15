import WooCommerceRestApi from '@woocommerce/woocommerce-rest-api';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  // Haal de credentials dynamisch op per request om opstartfouten in Next.js/PM2 te voorkomen
  const url = process.env.WOOCOMMERCE_URL || process.env.NEXT_PUBLIC_WOOCOMMERCE_URL || 'https://www.bendemen.com';
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.NEXT_PUBLIC_WOOCOMMERCE_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.NEXT_PUBLIC_WOOCOMMERCE_SECRET;

  if (!consumerKey || !consumerSecret) {
    console.error('WooCommerce API sleutels ontbreken in .env');
    return res.status(500).json({
      success: false,
      error: 'WooCommerce API sleutels zijn niet geconfigureerd in de server omgevingsvariabelen (.env).'
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

    const products = rawProducts.map((product) => ({
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
      variations_data: Array.isArray(product.variations_data) ? product.variations_data : []
    }));

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