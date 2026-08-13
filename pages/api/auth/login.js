// pages/api/auth/login.js
import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const { username, password } = req.body;

  try {
    const wpResponse = await axios.post(`${process.env.WOO_SITE_URL}/wp-json/bendemen/v1/login`, {
      username,
      password
    }, {
      validateStatus: function (status) {
        return status < 500; // Accepteer ook 401/403 statussen zodat we ze netjes als JSON kunnen doorsturen
      }
    });

    return res.status(wpResponse.status).json(wpResponse.data || { success: false, error: 'Inloggen mislukt' });
  } catch (error) {
    console.error("Login API Error:", error.message);
    return res.status(500).json({ success: false, error: 'Serverfout bij verbinden met WordPress' });
  }
}