// pages/admin.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

export default function AdminDashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [stores, setStores] = useState([]);
  const [staff, setStaff] = useState([]);
  const [newStoreName, setNewStoreName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('pos_user'));
    if (!user || (user.role !== 'administrator' && user.role !== 'shop_manager')) {
      alert('Geen toegang tot het beheerpaneel!');
      router.push('/');
      return;
    }
    setCurrentUser(user);
    loadAdminData();
  }, [router]);

  const loadAdminData = async () => {
    try {
      // Omdat we inloggen via WP, kunnen we direct admin requests afvuren of via een Next.js API route.
      // Voor het gemak halen we het hier op.
      const storesRes = await axios.get(`${process.env.NEXT_PUBLIC_WOO_SITE_URL || ''}/wp-json/bendemen/v1/stores`);
      setStores(storesRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateStore = async (e) => {
    e.preventDefault();
    if (!newStoreName) return;
    setLoading(true);
    try {
      const res = await axios.post('/api/admin/store', { name: newStoreName });
      if (res.data.success) {
        setStores(res.data.stores);
        setNewStoreName('');
        alert('Winkel succesvol aangemaakt!');
      }
    } catch (err) {
      alert('Fout bij aanmaken winkel.');
    }
    setLoading(false);
  };

  if (!currentUser) return null;

  return (
    <div style={{ padding: '40px', fontFamily: 'Arial', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1>Bendemen POS - Beheerpaneel</h1>
        <button onClick={() => router.push('/')} style={{ padding: '10px 15px', cursor: 'pointer' }}>Terug naar Kassa</button>
      </div>

      {/* Winkel Toevoegen */}
      <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '30px' }}>
        <h2>Nieuwe Winkel Aanmaken</h2>
        <form onSubmit={handleCreateStore} style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
          <input 
            type="text" 
            placeholder="Winkelnaam (bijv. Bendemen Amsterdam)" 
            value={newStoreName}
            onChange={(e) => setNewStoreName(e.target.value)}
            style={{ flex: 1, padding: '10px', fontSize: '16px' }}
            required
          />
          <button type="submit" disabled={loading} style={{ padding: '10px 20px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            {loading ? 'Bezig...' : 'Winkel Toevoegen'}
          </button>
        </form>
      </div>

      {/* Bestaande Winkels Overzicht */}
      <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
        <h2>Actieve Winkels</h2>
        <ul style={{ marginTop: '10px', paddingLeft: '20px' }}>
          {stores.map(store => (
            <li key={store.id} style={{ padding: '8px 0', fontSize: '16px' }}>
              <strong>{store.name}</strong> <span style={{ color: '#666', fontSize: '14px' }}>({store.id})</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}