// pages/api/admin/store.js
import axios from 'axios';

export default async function handler(req, res) {
  // We staan alleen POST-aanvragen toe, omdat we gegevens willen opslaan
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { name, category_name } = req.body;

  try {
    // We sturen de data door naar het WordPress API endpoint dat we in functions.php hebben gemaakt
    const wpResponse = await axios.post(`${process.env.WOO_SITE_URL}/wp-json/bendemen/v1/stores`, {
      name: name,
      category_name: category_name
    });

    // Stuur het resultaat van WordPress terug naar je Admin Dashboard
    res.status(200).json(wpResponse.data);
  } catch (error) {
    // Log de fout in de terminal (PM2 logs)
    console.error("Admin Store API Error:", error.response?.data || error.message);
    
    // Geef een duidelijke foutmelding terug naar de frontend
    res.status(500).json({ 
      success: false, 
      error: error.response?.data?.message || 'Fout bij aanmaken winkel in WordPress' 
    });
  }
}