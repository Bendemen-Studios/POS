// pages/api/admin/users.js
import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";

const api = new WooCommerceRestApi({
  url: process.env.WOO_SITE_URL,
  consumerKey: process.env.WOO_CONSUMER_KEY,
  consumerSecret: process.env.WOO_CONSUMER_SECRET,
  version: "wc/v3"
});

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      // Haal WooCommerce klanten/gebruikers op die als POS personeel fungeren
      const response = await api.get("customers", { per_page: 50 });
      
      // Filter of map gebruikers die een POS rol hebben
      const users = response.data.map(customer => {
        const roleMeta = customer.meta_data?.find(m => m.key === '_pos_role');
        const storeMeta = customer.meta_data?.find(m => m.key === '_pos_store_id');
        
        return {
          id: customer.id,
          name: `${customer.first_name} ${customer.last_name}`.trim() || customer.username,
          email: customer.email,
          role: roleMeta ? roleMeta.value : 'cashier',
          storeId: storeMeta ? storeMeta.value : 'store_ons_winkeltje'
        };
      });

      res.status(200).json({ success: true, users });
    } catch (error) {
      console.error("Error fetching users:", error.response?.data || error.message);
      res.status(500).json({ success: false, error: 'Fout bij ophalen van gebruikers' });
    }
  } 
  else if (req.method === 'POST') {
    const { username, email, password, role, storeId, firstName, lastName } = req.body;

    try {
      // Maak nieuwe gebruiker aan in WooCommerce
      const customerData = {
        email: email,
        first_name: firstName || '',
        last_name: lastName || '',
        username: username,
        password: password,
        meta_data: [
          { key: '_pos_role', value: role }, // 'administrator', 'shop_manager', 'cashier'
          { key: '_pos_store_id', value: storeId } // bijv. 'store_ons_winkeltje'
        ]
      };

      const response = await api.post("customers", customerData);
      res.status(200).json({ success: true, user: response.data });
    } catch (error) {
      console.error("Error creating user:", error.response?.data || error.message);
      res.status(500).json({ success: false, error: error.response?.data?.message || 'Fout bij aanmaken van gebruiker' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}