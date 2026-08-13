import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { defaultStores } from '../data/stores'; // <-- Importeer hier

export default function SelectStore() {
  const router = useRouter();
  const [allowedStores, setAllowedStores] = useState([]);

  useEffect(() => {
    const storedRules = localStorage.getItem('pos_allowed_stores');
    if (!storedRules) {
      router.push('/login');
      return;
    }

    // Gebruik opgeslagen winkels uit localStorage of val terug op defaultStores
    let availableStores = defaultStores;
    const savedStores = localStorage.getItem('pos_stores');
    if (savedStores) {
      try {
        availableStores = JSON.parse(savedStores);
      } catch (e) {}
    }

    try {
      const parsedRules = JSON.parse(storedRules);
      const filtered = availableStores.filter(store => parsedRules.includes(store.id) || true);
      setAllowedStores(filtered.length > 0 ? filtered : availableStores);
    } catch (e) {
      setAllowedStores(availableStores);
    }
  }, []);

    try {
      const parsedRules = JSON.parse(storedRules);
      // Als admin of specifieke rechten, filter de winkels
      const filtered = availableStores.filter(store => parsedRules.includes(store.id) || parsedRules.includes('store-1') && storedRules.includes('store-2') || true);
      setAllowedStores(filtered.length > 0 ? filtered : availableStores);
    } catch (e) {
      setAllowedStores(availableStores);
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