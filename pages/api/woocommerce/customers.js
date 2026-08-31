import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import { extractCustomerPoints } from "../../../lib/customerPoints";

const WooCommerce = WooCommerceRestApi.default || WooCommerceRestApi;

const api = new WooCommerce({
  url: process.env.WOO_SITE_URL || process.env.WOOCOMMERCE_URL || "https://www.bendemen.com",
  consumerKey: process.env.WOO_CONSUMER_KEY || process.env.WOOCOMMERCE_CONSUMER_KEY || process.env.WOOCOMMERCE_KEY,
  consumerSecret: process.env.WOO_CONSUMER_SECRET || process.env.WOOCOMMERCE_CONSUMER_SECRET || process.env.WOOCOMMERCE_SECRET,
  version: "wc/v3",
  axiosConfig: { timeout: 15000 },
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: `Method ${req.method} not allowed` });
  }

  try {
    const allCustomers = [];
    const perPage = 100;
    let page = 1;

    while (page <= 1000) {
      const response = await api.get("customers", { per_page: perPage, page });
      const customers = Array.isArray(response.data) ? response.data : [];

      allCustomers.push(
        ...customers.map((customer) => ({
          ...customer,
          points_balance: extractCustomerPoints(customer),
        }))
      );

      const totalPages = Number(
        response.headers?.['x-wp-totalpages'] ||
        response.headers?.['X-WP-TotalPages'] ||
        0
      );

      if (customers.length < perPage || (totalPages > 0 && page >= totalPages)) break;
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
    return res.status(502).json({ success: false, error: error.response?.data?.message || error.message || 'Fout bij ophalen klanten' });
  }
}
