import pool from '../../../lib/db';

export default async function handler(req, res) {
  try {
    const [users] = await pool.execute('SELECT id, username, email, role FROM users');

    const formattedUsers = users.map(user => ({
      ...user,
      // Forceer rol voor bendemen bij het ophalen uit de lijst
      role: (user.username === 'bendemen' || user.email === 'bendemenbv@gmail.com') 
        ? 'super_admin' 
        : (user.role || 'cashier')
    }));

    res.status(200).json(formattedUsers);
  } catch (error) {
    res.status(500).json({ error: 'Fout bij ophalen gebruikers' });
  }
}