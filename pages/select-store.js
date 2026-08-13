import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import { fetcher } from '../lib/fetcher';

export default function SelectStore() {
  const router = useRouter();

  const [cachedStores, setCachedStores] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('cached_pos_stores');
      if (saved) {
        try { return JSON.parse(saved); } catch (e) {}
      }
    }
    return [{ id: 'store_ons_winkeltje', name: 'Ons Winkeltje', location: 'Hoofdvestiging' }];
  });

  const { data } = useSWR('/api/stores', fetcher, {
    fallbackData: { success: true, stores: cachedStores },
    revalidateOnFocus: false,
    revalidateIfStale: false
  });

  const stores = data?.stores || cachedStores;

  useEffect(() => {
    const storedRules = localStorage.getItem('pos_allowed_stores');
    if (!storedRules) {
      router.push('/login');
      return;
    }
    if (data?.stores) {
      localStorage.setItem('cached_pos_stores', JSON.stringify(data.stores));
    }
  }, [data, router]);

  const selectStore = (store) => {
    const storeData = {
      id: store.id || 'store_ons_winkeltje',
      name: store.name || 'Ons Winkeltje',
      location: store.location || 'Hoofdvestiging'
    };
    localStorage.setItem('selectedStore', JSON.stringify(storeData));
    window.location.href = '/';
  };

  return (
    <div style={{ background: '#FFFFFF', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: '500px', padding: '40px', background: '#FAFAFA', borderRadius: '16px', border: '1px solid #EAEAEA' }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '800', margin: '0 0 5px 0' }}>Kies je Vestiging</h1>
          <p style={{ fontSize: '14px', color: '#666' }}>Selecteer een winkel waar je toegang toe hebt.</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {stores.map(store => (
            <button 
              key={store.id || store.name}
              onClick={() => selectStore(store)}
              type="button"
              style={{ 
                width: '100%',
                padding: '20px', 
                background: '#FFFFFF', 
                border: '1px solid #E0E0E0', 
                borderRadius: '12px', 
                cursor: 'pointer', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                textAlign: 'left',
                transition: 'border-color 0.2s' 
              }}
            >
              <div>
                <h3 style={{ margin: '0 0 5px 0', fontSize: '16px', fontWeight: '700', color: '#111' }}>{store.name}</h3>
                <span style={{ fontSize: '12px', color: '#666' }}>{store.location}</span>
              </div>
              <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#C3110C' }}>→</span>
            </button>
          ))}
        </div>
        
        <button 
          onClick={() => {
            localStorage.clear();
            window.location.href = '/login';
          }}
          type="button"
          style={{ marginTop: '25px', background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '13px', width: '100%', textAlign: 'center' }}
        >
          ← Uitloggen / Ander account
        </button>
      </div>
    </div>
  );
}