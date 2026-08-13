import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

export default function SelectStore() {
  const router = useRouter();
  const [allowedStores, setAllowedStores] = useState([]);

  useEffect(() => {
    const storedRules = localStorage.getItem('pos_allowed_stores');
    if (!storedRules) {
      router.push('/login');
      return;
    }

    axios.get('/api/stores')
      .then(res => {
        if (res.data.success) {
          const allStores = res.data.stores;
          try {
            const parsedRules = JSON.parse(storedRules);
            const filtered = allStores.filter(store => 
              parsedRules.includes(store.id) || parsedRules.includes('store-1') || parsedRules.length === 0
            );
            setAllowedStores(filtered.length > 0 ? filtered : allStores);
          } catch (e) {
            setAllowedStores(allStores);
          }
        }
      })
      .catch(err => console.error(err));
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
          {allowedStores.map(store => (
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
          ))}
        </div>
      </div>
    </div>
  );
}