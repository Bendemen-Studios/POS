// pages/select-store.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function SelectStore() {
  const router = useRouter();
  const [stores, setStores] = useState([]);

  useEffect(() => {
    const savedStores = JSON.parse(localStorage.getItem('pos_available_stores') || '[]');
    setStores(savedStores);
    
    // Als er maar 1 winkel is, direct doorsturen
    if (savedStores.length === 1) {
      localStorage.setItem('pos_active_store', JSON.stringify(savedStores[0]));
      router.push('/');
    } else if (savedStores.length === 0) {
      router.push('/');
    }
  }, [router]);

  const handleSelectStore = (store) => {
    localStorage.setItem('pos_active_store', JSON.stringify(store));
    router.push('/');
  };

  return (
    <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: '#f5f5f5', fontFamily: 'Arial' }}>
      <div style={{ background: '#fff', padding: '40px', borderRadius: '8px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', width: '350px', textAlign: 'center' }}>
        <h2>Kies een Winkel</h2>
        <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>Selecteer de actieve locatie voor deze sessie.</p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {stores.map(store => (
            <button
              key={store.id}
              onClick={() => handleSelectStore(store)}
              style={{ padding: '15px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '16px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              {store.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}