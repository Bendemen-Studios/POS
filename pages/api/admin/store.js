// pages/api/admin/store.js
import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { name } = req.body;

  try {
    const wpResponse = await axios.post(`${process.env.WOO_SITE_URL}/wp-json/bendemen/v1/stores`, {
      name: name
    });

    res.status(200).json(wpResponse.data);
  } catch (error) {
    console.error("Admin Store API Error:", error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      error: error.response?.data?.message || 'Fout bij aanmaken winkel in WordPress' 
    });
  }
}