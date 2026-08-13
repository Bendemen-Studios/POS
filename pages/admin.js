// pages/admin.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

export default function AdminPanel() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [stores, setStores] = useState([]);
  const [newStoreName, setNewStoreName] = useState('');
  
  // Edit store states
  const [editingStoreId, setEditingStoreId] = useState(null);
  const [editedStoreName, setEditedStoreName] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('pos_token');
    const user = JSON.parse(localStorage.getItem('pos_user') || 'null');

    if (!token || !user || (user.role !== 'administrator' && user.role !== 'shop_manager')) {
      router.push('/login');
      return;
    }

    setCurrentUser(user);
    loadAdminData();
  }, [router]);

  const loadAdminData = async () => {
    try {
      const res = await axios.get('/api/admin/stores');
      setStores(res.data || []);
    } catch (err) {
      console.error("Fout bij laden winkels:", err);
    }
  };

  const handleCreateStore = async (e) => {
    e.preventDefault();
    if (!newStoreName.trim()) {
      alert('Vul een winkelnaam in.');
      return;
    }

    try {
      const res = await axios.post('/api/admin/store', { name: newStoreName });
      if (res.data.success) {
        alert('Winkel succesvol aangemaakt!');
        setNewStoreName('');
        loadAdminData();
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Fout bij aanmaken winkel.');
    }
  };

  const handleUpdateStore = async (storeId) => {
    if (!editedStoreName.trim()) {
      alert('Winkelnaam mag niet leeg zijn.');
      return;
    }

    try {
      const res = await axios.put('/api/admin/stores', { id: storeId, name: editedStoreName });
      if (res.data.success) {
        alert('Winkel succesvol bijgewerkt!');
        setEditingStoreId(null);
        loadAdminData();
      }
    } catch (err) {
      alert('Fout bij bijwerken van winkel.');
    }
  };

  if (!currentUser) return null;

  return (
    <div style={{ padding: '30px', fontFamily: 'Arial', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1>Bendemen POS - Beheerderspaneel</h1>
        <button 
          onClick={() => router.push('/')} 
          style={{ padding: '10px 15px', background: '#333', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
        >
          Terug naar Kassa
        </button>
      </div>

      {/* Nieuwe winkel aanmaken (zonder categorie velden) */}
      <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '30px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
        <h3>Nieuwe Winkel Aanmaken</h3>
        <form onSubmit={handleCreateStore} style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
          <input 
            type="text" 
            placeholder="Winkelnaam (bijv. Bendemen Amsterdam)" 
            value={newStoreName}
            onChange={(e) => setNewStoreName(e.target.value)}
            style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
          />
          <button 
            type="submit" 
            style={{ padding: '10px 20px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Winkel Toevoegen
          </button>
        </form>
      </div>

      {/* Actieve winkels lijst (zonder categorieën, met hernoem optie) */}
      <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #ddd', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
        <h3>Actieve Winkels</h3>
        <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {stores.length === 0 ? (
            <p style={{ color: '#666' }}>Geen actieve winkels gevonden.</p>
          ) : (
            stores.map(store => (
              <div key={store.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: '#fafafa', borderRadius: '5px', border: '1px solid #eee' }}>
                {editingStoreId === store.id ? (
                  <div style={{ display: 'flex', gap: '10px', flex: 1, marginRight: '10px' }}>
                    <input 
                      type="text" 
                      value={editedStoreName} 
                      onChange={(e) => setEditedStoreName(e.target.value)}
                      style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                    <button onClick={() => handleUpdateStore(store.id)} style={{ padding: '8px 12px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Opslaan</button>
                    <button onClick={() => setEditingStoreId(null)} style={{ padding: '8px 12px', background: '#ccc', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Annuleren</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', flex: 1, alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '15px' }}>{store.name}</span>
                    <button 
                      onClick={() => { setEditingStoreId(store.id); setEditedStoreName(store.name); }}
                      style={{ padding: '6px 12px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}
                    >
                      Hernoemen
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}