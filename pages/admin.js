// pages/admin.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

export default function AdminPanel() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Formulier state voor nieuwe gebruiker
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    role: 'cashier',
    storeId: 'store_ons_winkeltje'
  });

  const stores = [
    { id: 'store_ons_winkeltje', name: 'Ons Winkeltje' },
    // Voeg hier eventueel extra winkels toe
  ];

  useEffect(() => {
    const token = localStorage.getItem('pos_token');
    const user = JSON.parse(localStorage.getItem('pos_user') || '{}');

    if (!token || (user.role !== 'administrator' && user.role !== 'shop_manager')) {
      router.push('/');
      return;
    }

    fetchUsers();
  }, [router]);

  const fetchUsers = async () => {
    try {
      const res = await axios.get('/api/admin/users');
      if (res.data.success) {
        setUsers(res.data.users);
      }
    } catch (error) {
      alert('Fout bij ophalen van personeelslijst.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    if (!form.username || !form.email || !form.password) {
        alert('Vul minimaal gebruikersnaam, e-mail en wachtwoord in.');
        return;
    }

    try {
      const res = await axios.post('/api/admin/users', form);
      if (res.data.success) {
        alert('Personeelslid succesvol toegevoegd!');
        setForm({
          username: '',
          email: '',
          password: '',
          firstName: '',
          lastName: '',
          role: 'cashier',
          storeId: 'store_ons_winkeltje'
        });
        fetchUsers();
      }
    } catch (error) {
      alert(error.response?.data?.error || 'Fout bij aanmaken van gebruiker.');
    }
  };

  return (
    <div style={{ padding: '30px', fontFamily: 'Arial', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h1>⚙️ Bendemen POS - Beheer</h1>
        <button 
          onClick={() => router.push('/')}
          style={{ padding: '10px 15px', background: '#333', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
        >
          ← Terug naar Kassa
        </button>
      </div>

      {/* Formulier om gebruiker toe te voegen */}
      <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '30px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Nieuw Personeel / Manager Toevoegen</h3>
        
        <form onSubmit={handleCreateUser} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Gebruikersnaam</label>
            <input 
              type="text" 
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>E-mailadres</label>
            <input 
              type="email" 
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Voornaam</label>
            <input 
              type="text" 
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Achternaam</label>
            <input 
              type="text" 
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Wachtwoord</label>
            <input 
              type="password" 
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Rol / Functie</label>
            <select 
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', background: '#fff' }}
            >
              <option value="cashier">Personeel (Kassa)</option>
              <option value="shop_manager">Manager</option>
              <option value="administrator">Administrator</option>
            </select>
          </div>

          <div style={{ gridColumn: 'span 2' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '5px' }}>Toegewezen Winkel</label>
            <select 
              value={form.storeId}
              onChange={(e) => setForm({ ...form, storeId: e.target.value })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', background: '#fff' }}
            >
              {stores.map(store => (
                <option key={store.id} value={store.id}>{store.name}</option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: 'span 2', marginTop: '10px' }}>
            <button 
              type="submit" 
              style={{ width: '100%', padding: '12px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Gebruiker Aanmaken
            </button>
          </div>
        </form>
      </div>

      {/* Lijst van bestaande gebruikers */}
      <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #ddd', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
        <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Geregistreerd Personeel</h3>
        {isLoading ? (
          <p>Laden...</p>
        ) : users.length === 0 ? (
          <p style={{ color: '#666' }}>Geen gebruikers gevonden.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #eee', color: '#555', fontSize: '13px' }}>
                <th style={{ padding: '10px' }}>Naam</th>
                <th style={{ padding: '10px' }}>E-mail</th>
                <th style={{ padding: '10px' }}>Rol</th>
                <th style={{ padding: '10px' }}>Winkel</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ borderBottom: '1px solid #eee', fontSize: '14px' }}>
                  <td style={{ padding: '10px', fontWeight: 'bold' }}>{u.name}</td>
                  <td style={{ padding: '10px', color: '#666' }}>{u.email}</td>
                  <td style={{ padding: '10px' }}>
                    <span style={{ 
                      padding: '3px 8px', 
                      borderRadius: '4px', 
                      fontSize: '12px', 
                      background: u.role === 'administrator' ? '#ffe6e6' : u.role === 'shop_manager' ? '#e6f7ff' : '#f0f0f0',
                      color: u.role === 'administrator' ? '#d9534f' : u.role === 'shop_manager' ? '#0070f3' : '#333'
                    }}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ padding: '10px' }}>{u.storeId === 'store_ons_winkeltje' ? 'Ons Winkeltje' : u.storeId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}