import { useState } from 'react';
import { useRouter } from 'next/router';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  // Dummy toegangsrechten per gebruiker (kun je later koppelen aan een database)
  const userAccessRules = {
    'admin': ['store-1', 'store-2'], // Admin heeft toegang tot alle winkels
    'bendemen': ['store-1'],         // Flagship hellevoetsluis
    'rotterdam': ['store-2']         // Pop-up rotterdam
  };

  const handleLogin = (e) => {
    e.preventDefault();
    const cleanUser = username.trim().toLowerCase();

    if (!cleanUser || !password) {
      setError('Vul alle velden in.');
      return;
    }

    if (!userAccessRules[cleanUser]) {
      setError('Onbekende gebruikersnaam of geen toegang.');
      return;
    }

    // Sla de gebruikersrechten op voor de volgende pagina's
    localStorage.setItem('pos_user', cleanUser);
    localStorage.setItem('pos_allowed_stores', JSON.stringify(userAccessRules[cleanUser]));
    
    // Verwijder eventuele oude actieve winkelkeuze zodat ze áltijd moeten kiezen
    localStorage.removeItem('selectedStore');

    router.push('/select-store');
  };

  return (
    <div style={{ background: '#FFFFFF', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: '400px', padding: '40px', background: '#FAFAFA', borderRadius: '16px', border: '1px solid #EAEAEA', boxShadow: '0 10px 30px rgba(0,0,0,0.03)' }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <div style={{ display: 'inline-block', background: '#000000', color: '#FFFFFF', padding: '10px 16px', fontWeight: '900', fontSize: '22px', borderRadius: '6px', letterSpacing: '1px', marginBottom: '15px' }}>
            BOM
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: '800', margin: '0 0 5px 0', color: '#111' }}>BENDEMEN POS</h1>
          <p style={{ fontSize: '13px', color: '#666', fontStyle: 'italic', margin: 0 }}>Met zorg gemaakt!</p>
        </div>

        {error && (
          <div style={{ padding: '12px', background: '#FCE8E6', color: '#C3110C', borderRadius: '8px', fontSize: '13px', marginBottom: '20px', fontWeight: '600', border: '1px solid #FAD2D1' }}>
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: '#333', textTransform: 'uppercase' }}>Gebruikersnaam</label>
            <input 
              type="text" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Bijv. admin of bendemen"
              style={{ width: '100%', padding: '12px 15px', borderRadius: '8px', border: '1px solid #DDD', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: '#333', textTransform: 'uppercase' }}>Wachtwoord</label>
            <input 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ width: '100%', padding: '12px 15px', borderRadius: '8px', border: '1px solid #DDD', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <button 
            type="submit" 
            style={{ marginTop: '10px', padding: '14px', background: '#000000', color: '#FFFFFF', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '15px', cursor: 'pointer' }}
          >
            Inloggen & Kies Winkel
          </button>
        </form>
      </div>
    </div>
  );
}