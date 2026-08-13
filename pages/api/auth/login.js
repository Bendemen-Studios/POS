// pages/api/auth/login.js
import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { username, password } = req.body;

  try {
    // 1. Authenticatie via het WordPress login endpoint
    const wpResponse = await axios.post(`${process.env.WOO_SITE_URL}/wp-json/bendemen/v1/login`, {
      username: username,
      password: password
    });

    const user = wpResponse.data;

    // 2. Haal alle actieve winkels en toegewezen winkels van deze gebruiker op uit WP
    const storesRes = await axios.get(`${process.env.WOO_SITE_URL}/wp-json/bendemen/v1/stores`);
    const allStores = storesRes.data;

    // Haal user details op voor user_meta (optioneel via admin credentials of direct)
    // Voor nu filteren we op basis van rol: Administrators krijgen alle winkels, personeel alleen hun toegewezen winkels
    let userStores = allStores;
    if (user.role !== 'administrator' && user.role !== 'shop_manager') {
      // Standaard regel voor medewerkers (kun je uitbreiden met WP user meta call)
      userStores = allStores.filter(s => s.id === 'store_ons_winkeltje');
    }

    res.status(200).json({
      success: true,
      token: 'wp_verified_token',
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        stores: userStores
      }
    });

  } catch (error) {
    console.error("WordPress Login Error:", error.response?.data || error.message);
    res.status(401).json({ success: false, message: 'Onjuiste gebruikersnaam of wachtwoord' });
  }
}