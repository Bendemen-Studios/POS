/// pages/api/admin/stores.js
import axios from 'axios';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const wpResponse = await axios.get(`${process.env.WOO_SITE_URL}/wp-json/bendemen/v1/stores`);
      return res.status(200).json(wpResponse.data);
    } catch (error) {
      console.error("Get Stores API Error:", error.response?.data || error.message);
      return res.status(500).json({ success: false, error: 'Fout bij ophalen winkels uit WordPress' });
    }
  }

  if (req.method === 'PUT') {
    const { id, name } = req.body;
    try {
      const wpResponse = await axios.put(`${process.env.WOO_SITE_URL}/wp-json/bendemen/v1/stores`, {
        id,
        name
      });
      return res.status(200).json(wpResponse.data);
    } catch (error) {
      console.error("Update Store API Error:", error.response?.data || error.message);
      return res.status(500).json({ success: false, error: error.response?.data?.message || 'Fout bij bijwerken winkel in WordPress' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}