import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import { extractCustomerPoints } from "../../../lib/customerPoints";

const WooCommerce = WooCommerceRestApi.default || WooCommerceRestApi;

const url = process.env.WOO_SITE_URL || process.env.WOOCOMMERCE_URL || process.env.NEXT_PUBLIC_WOOCOMMERCE_URL || "https://www.bendemen.com";
const consumerKey = process.env.WOO_CONSUMER_KEY || process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOOCOMMERCE_KEY || process.env.NEXT_PUBLIC_WOOCOMMERCE_KEY;
const consumerSecret = process.env.WOO_CONSUMER_SECRET || process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOOCOMMERCE_SECRET || process.env.NEXT_PUBLIC_WOOCOMMERCE_SECRET;

const api = new WooCommerce({
  url,
  consumerKey,
  consumerSecret,
  version: "wc/v3",
  axiosConfig: { timeout: 30000 },
});

function normalizeCustomer(customer) {
  return {
    ...customer,
    id: customer.id,
    first_name: customer.first_name || '',
    last_name: customer.last_name || '',
    email: customer.email || '',
    username: customer.username || '',
    points_balance: extractCustomerPoints(customer),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
  }

  if (!consumerKey || !consumerSecret) {
    return res.status(500).json({ success: false, error: 'WooCommerce API sleutels zijn niet geconfigureerd.' });
  }

  try {
    const allCustomers = [];
    const perPage = 100;
    let page = 1;
    let totalPages = 1;

    while (page <= Math.min(totalPages, 1000)) {
      const response = await api.get("customers", {
        per_page: perPage,
        page,
        orderby: 'id',
        order: 'asc',
      });
      const customers = Array.isArray(response.data) ? response.data : [];
      allCustomers.push(...customers.map(normalizeCustomer));

      totalPages = Number(
        response.headers?.['x-wp-totalpages'] ||
        response.headers?.['X-WP-TotalPages'] ||
        (customers.length === perPage ? page + 1 : page)
      );

      if (customers.length < perPage) break;
      page += 1;
    }

    res.setHeader('Cache-Control', 'private, max-age=0, no-cache, no-store, must-revalidate');
    return res.status(200).json({
      success: true,
      customers: allCustomers,
      total: allCustomers.length,
    });
  } catch (error) {
    console.error("WooCommerce Customers Fetch Error:", error.response?.data || error.message);
    return res.status(502).json({
      success: false,
      error: error.response?.data?.message || error.message || 'Fout bij ophalen klanten',
    });
  }
}
