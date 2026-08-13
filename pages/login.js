import { useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    try {
      const res = await axios.post('/api/auth/login', { username, password });
      if (res.data.success) {
        localStorage.setItem('pos_token', res.data.token);
        localStorage.setItem('pos_user', JSON.stringify(res.data.user));
        localStorage.setItem('pos_allowed_stores', JSON.stringify(res.data.allowedStores || ['store_ons_winkeltje']));
        router.push('/select-store');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Ongeldige inloggegevens.');
    }
  };

  return (
    <div style={{ background: '#FFFFFF', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '40px', background: '#FAFAFA', borderRadius: '16px', border: '1px solid #EAEAEA' }}>
        
        {/* Header met BDM logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '25px', justifyContent: 'center' }}>
          <div style={{ background: '#000', color: '#FFF', padding: '8px 12px', fontWeight: '900', borderRadius: '6px', fontSize: '18px' }}>BDM</div>
          <h1 style={{ fontSize: '20px', fontWeight: '800', margin: 0 }}>BENDEMEN POS</h1>
        </div>

        {error && (
          <div style={{ background: '#FCE8E6', color: '#C3110C', padding: '12px', borderRadius: '8px', fontSize: '13px', marginBottom: '20px', textAlign: 'center', fontWeight: '600' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', color: '#333' }}>Gebruikersnaam</label>
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={{ width: '100%', padding: '12px', border: '1px solid #DDD', borderRadius: '8px', boxSizing: 'border-box', fontSize: '14px', outline: 'none' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', color: '#333' }}>Wachtwoord</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: '100%', padding: '12px', border: '1px solid #DDD', borderRadius: '8px', boxSizing: 'border-box', fontSize: '14px', outline: 'none' }}
            />
          </div>

          <button 
            type="submit" 
            style={{ marginTop: '10px', width: '100%', padding: '14px', background: '#C3110C', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '15px', cursor: 'pointer' }}
          >
            Inloggen
          </button>
        </form>

      </div>
    </div>
  );
}