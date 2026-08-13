// pages/api/woocommerce/customers.js
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

const api = new WooCommerceRestApi({
  url: process.env.WOO_SITE_URL,
  consumerKey: process.env.WOO_CONSUMER_KEY,
  consumerSecret: process.env.WOO_CONSUMER_SECRET,
  version: "wc/v3"
});

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });

  const { search } = req.query;

  try {
    const response = await api.get("customers", {
      search: search || "",
      per_page: 20, // Toon maximaal 20 resultaten tegelijk
      role: 'all'
    });

    // We filteren de data en halen het huidige puntensaldo uit de meta_data
    const customers = response.data.map(customer => {
      const pointsMeta = customer.meta_data.find(meta => meta.key === 'wc_points_balance');
      
      return {
        id: customer.id,
        name: `${customer.first_name} ${customer.last_name}`.trim() || customer.username,
        email: customer.email,
        points_balance: pointsMeta ? parseInt(pointsMeta.value) : 0
      };
    });

    res.status(200).json({ success: true, customers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Fout bij ophalen klanten uit WooCommerce' });
  }
}