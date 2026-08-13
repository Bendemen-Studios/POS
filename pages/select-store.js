import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function SelectStore() {
  const router = useRouter();
  const [allowedStores, setAllowedStores] = useState([]);

  const allStores = [
    { id: 'store-1', name: 'Bendemen Flagship - Hellevoetsluis', location: 'Hoofdvestiging' },
    { id: 'store-2', name: 'Bendemen Pop-up - Rotterdam', location: 'Filiaal Noord' }
  ];

  useEffect(() => {
    const storedRules = localStorage.getItem('pos_allowed_stores');
    if (!storedRules) {
      // Geen sessie? Terug naar login
      router.push('/login');
      return;
    }

    try {
      const parsedRules = JSON.parse(storedRules);
      const filtered = allStores.filter(store => parsedRules.includes(store.id));
      setAllowedStores(filtered);
    } catch (e) {
      router.push('/login');
    }
  }, []);

  const selectStore = (store) => {
    localStorage.setItem('selectedStore', JSON.stringify(store));
    router.push('/');
  };

  return (
    <div style={{ background: '#FFFFFF', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: '500px', padding: '40px', background: '#FAFAFA', borderRadius: '16px', border: '1px solid #EAEAEA' }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '800', margin: '0 0 5px 0' }}>Kies je Vestiging</h1>
          <p style={{ fontSize: '14px', color: '#666' }}>Selecteer een winkel waar je toegang toe hebt.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {allowedStores.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#888' }}>Geen winkels beschikbaar voor jouw account.</p>
          ) : (
            allowedStores.map(store => (
              <div 
                key={store.id}
                onClick={() => selectStore(store)}
                style={{ padding: '20px', background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: '12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <h3 style={{ margin: '0 0 5px 0', fontSize: '16px', fontWeight: '700', color: '#111' }}>{store.name}</h3>
                  <span style={{ fontSize: '12px', color: '#666' }}>{store.location}</span>
                </div>
                <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#C3110C' }}>→</span>
              </div>
            ))
          )}
        </div>
        
        <button 
          onClick={() => {
            localStorage.clear();
            router.push('/login');
          }}
          style={{ marginTop: '25px', background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '13px', width: '100%', textAlign: 'center' }}
        >
          ← Uitloggen / Ander account
        </button>
      </div>
    </div>
  );
}

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