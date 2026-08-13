// pages/api/auth/login.js

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { username, password } = req.body;

  // Mock database: Hier koppel je later je echte database aan (bijv. MariaDB)
  const users = [
    { 
      id: 1, 
      username: 'ben', 
      password: 'password123', // In productie gebruik je hier bcrypt hashes
      name: 'Ben',
      role: 'admin',
      allowed_stores: ['store_hq', 'store_ons_winkeltje']
    },
    { 
      id: 2, 
      username: 'kassa_medewerker', 
      password: 'pin', 
      name: 'Kassa 1',
      role: 'cashier',
      allowed_stores: ['store_ons_winkeltje']
    }
  ];

  const stores = [
    { id: 'store_hq', name: 'Bendemen HQ' },
    { id: 'store_ons_winkeltje', name: 'Ons Winkeltje' }
  ];

  const user = users.find(u => u.username === username && u.password === password);

  if (!user) {
    return res.status(401).json({ success: false, message: 'Ongeldige inloggegevens' });
  }

  // Filter de winkels waar deze gebruiker toegang toe heeft
  const userStores = stores.filter(store => user.allowed_stores.includes(store.id));

  // Geef een token en de gebruikersdata terug
  res.status(200).json({
    success: true,
    token: 'simulated_jwt_token_12345', // Vervang later door echte JWT
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      stores: userStores
    }
  });
}