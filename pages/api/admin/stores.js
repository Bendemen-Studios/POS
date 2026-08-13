// pages/api/admin/stores.js
import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Haal de winkels veilig op via de WordPress backend op je server
    const wpResponse = await axios.get(`${process.env.WOO_SITE_URL}/wp-json/bendemen/v1/stores`);
    res.status(200).json(wpResponse.data);
  } catch (error) {
    console.error("Get Stores API Error:", error.response?.data || error.message);
    res.status(500).json({ success: false, error: 'Fout bij ophalen winkels uit WordPress' });
  }
}