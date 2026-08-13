// pages/login.js
import { useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState(1); // 1 = Login, 2 = Kies Winkel
  const [userData, setUserData] = useState(null);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      const response = await axios.post('/api/auth/login', { username, password });
      
      if (response.data.success) {
        setUserData(response.data.user);
        
        // Als de gebruiker maar 1 winkel heeft, direct doorsturen
        if (response.data.user.stores.length === 1) {
          selectStore(response.data.user.stores[0], response.data.user);
        } else {
          setStep(2); // Laat winkel selecteren
        }
      }
    } catch (err) {
      setError('Inloggen mislukt. Controleer je gegevens.');
    }
  };

  const selectStore = (store, user = userData) => {
    // Sla lokaal op voor offline gebruik
    localStorage.setItem('pos_token', 'simulated_jwt_token_12345');
    localStorage.setItem('pos_user', JSON.stringify(user));
    localStorage.setItem('pos_active_store', JSON.stringify(store));
    
    router.push('/');
  };

  return (
    <div style={{ maxWidth: '400px', margin: '100px auto', fontFamily: 'Arial', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
      <h1 style={{ textAlign: 'center' }}>Bendemen POS</h1>
      
      {error && <p style={{ color: 'red', textAlign: 'center' }}>{error}</p>}

      {step === 1 && (
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <input 
            type="text" 
            placeholder="Gebruikersnaam" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)}
            style={{ padding: '10px', fontSize: '16px' }}
            required
          />
          <input 
            type="password" 
            placeholder="Wachtwoord / PIN" 
            value={password} 
            onChange={(e) => setPassword(e.target.value)}
            style={{ padding: '10px', fontSize: '16px' }}
            required
          />
          <button type="submit" style={{ padding: '10px', background: '#000', color: '#fff', fontSize: '16px', cursor: 'pointer' }}>
            Inloggen
          </button>
        </form>
      )}

      {step === 2 && userData && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3>Kies Locatie</h3>
          {userData.stores.map(store => (
            <button 
              key={store.id} 
              onClick={() => selectStore(store)}
              style={{ padding: '15px', background: '#f5f5f5', border: '1px solid #ccc', cursor: 'pointer', fontSize: '16px' }}
            >
              {store.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}