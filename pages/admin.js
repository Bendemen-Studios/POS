// pages/admin.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

export default function AdminDashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [stores, setStores] = useState([]);
  const [newStoreName, setNewStoreName] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
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
      // Haal winkels op via onze eigen Next.js API route
      const res = await axios.get('/api/admin/stores');
      setStores(res.data);
    } catch (err) {
      console.error("Fout bij laden winkels:", err);
    }
  };

  const handleCreateStore = async (e) => {
    e.preventDefault();
    if (!newStoreName) return;
    setLoading(true);
    try {
      const res = await axios.post('/api/admin/store', { 
        name: newStoreName, 
        category_name: newCategoryName 
      });
      if (res.data.success) {
        setStores(res.data.stores);
        setNewStoreName('');
        setNewCategoryName('');
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
        <form onSubmit={handleCreateStore} style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
          <input 
            type="text" 
            placeholder="Winkelnaam (bijv. Bendemen Amsterdam)" 
            value={newStoreName}
            onChange={(e) => setNewStoreName(e.target.value)}
            style={{ padding: '10px', fontSize: '16px' }}
            required
          />
          <input 
            type="text" 
            placeholder="WooCommerce Categorie Naam (bijv. POS Amsterdam, leeg = automatisch)" 
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            style={{ padding: '10px', fontSize: '16px' }}
          />
          <button type="submit" disabled={loading} style={{ padding: '10px 20px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            {loading ? 'Bezig...' : 'Winkel Toevoegen'}
          </button>
        </form>
      </div>

      {/* Bestaande Winkels Overzicht */}
      <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
        <h2>Actieve Winkels & Categorieën</h2>
        <ul style={{ marginTop: '10px', paddingLeft: '20px' }}>
          {stores.map(store => (
            <li key={store.id} style={{ padding: '8px 0', fontSize: '16px' }}>
              <strong>{store.name}</strong> — Categorie: <span style={{ color: '#0070f3' }}>{store.category_name}</span> <span style={{ color: '#666', fontSize: '14px' }}>({store.id})</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}