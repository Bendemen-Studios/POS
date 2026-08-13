// pages/login.js
import { useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const loginRes = await axios.post('/api/auth/login', { username, password });

      if (loginRes.data && loginRes.data.success) {
        localStorage.setItem('pos_token', 'active_session');
        localStorage.setItem('pos_user', JSON.stringify(loginRes.data));

        let stores = [];
        try {
          const storesRes = await axios.get('/api/admin/stores');
          stores = storesRes.data || [];
        } catch (e) {
          console.error("Kon winkels niet ophalen", e);
        }

        if (stores.length > 0) {
          localStorage.setItem('pos_active_store', JSON.stringify(stores[0]));
        } else {
          localStorage.setItem('pos_active_store', JSON.stringify({
            id: 'store_ons_winkeltje',
            name: 'Ons Winkeltje',
            category_name: 'POS Ons Winkeltje'
          }));
        }

        router.push('/');
      } else {
        setError(loginRes.data?.error || 'Inloggen mislukt. Controleer je gebruikersnaam en wachtwoord.');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Inloggen mislukt. Controleer je gegevens of de verbinding met de server.';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: '#f5f5f5', fontFamily: 'Arial' }}>
      <form onSubmit={handleLogin} style={{ background: '#fff', padding: '40px', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', width: '300px' }}>
        <h2 style={{ marginBottom: '20px', textAlign: 'center' }}>Bendemen POS</h2>
        
        {error && <div style={{ color: 'red', marginBottom: '15px', fontSize: '14px', textAlign: 'center' }}>{error}</div>}

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>Gebruikersnaam</label>
          <input 
            type="text" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)} 
            style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}
            required 
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', fontWeight: 'bold' }}>Wachtwoord</label>
          <input 
            type="password" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            style={{ width: '100%', padding: '10px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #ccc' }}
            required 
          />
        </div>

        <button 
          type="submit" 
          disabled={loading} 
          style={{ width: '100%', padding: '12px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '16px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {loading ? 'Bezig...' : 'Inloggen'}
        </button>
      </form>
    </div>
  );
}