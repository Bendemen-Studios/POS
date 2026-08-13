// pages/api/auth/login.js
import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const { username, password } = req.body;

  try {
    // Stuur de inloggegevens door naar het WordPress REST API endpoint
    const wpResponse = await axios.post(`${process.env.WOO_SITE_URL}/wp-json/bendemen/v1/login`, {
      username,
      password
    });

    res.status(200).json(wpResponse.data);
  } catch (error) {
    console.error("Login API Error:", error.response?.data || error.message);
    res.status(401).json({ success: false, error: 'Inloggen mislukt' });
  }
}