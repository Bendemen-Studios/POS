import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import { fetcher } from '../lib/fetcher';

export default function Home() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);

  // Haal winkels op via SWR zodat we altijd een geldige winkel kunnen selecteren
  const { data: storesData } = useSWR('/api/stores', fetcher, { revalidateOnFocus: false });
  const stores = storesData?.stores || [];

  useEffect(() => {
    const rawUser = localStorage.getItem('pos_user');
    if (!rawUser) {
      router.push('/login');
      return;
    }

    try {
      setCurrentUser(JSON.parse(rawUser));
    } catch (e) {
      router.push('/login');
      return;
    }

    // Controleer of er al een winkel is geselecteerd
    const store = localStorage.getItem('selectedStore');
    if (store) {
      try {
        setSelectedStore(JSON.parse(store));
        return;
      } catch (e) {}
    }

    // Automatische fallback: Als er geen winkel geselecteerd is maar er zijn winkels, pak de eerste
    if (stores.length > 0) {
      const defaultStore = stores[0];
      localStorage.setItem('selectedStore', JSON.stringify(defaultStore));
      setSelectedStore(defaultStore);
    } else {
      // Als er echt geen winkels bekend zijn, stuur door naar select-store
      router.push('/select-store');
    }
  }, [router, stores]);

  return (
    <div style={{ background: '#FFFFFF', color: '#111111', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '30px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Top Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FAFAFA', padding: '20px 30px', borderRadius: '12px', border: '1px solid #EAEAEA', marginBottom: '30px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ background: '#000', color: '#FFF', padding: '8px 12px', fontWeight: '900', borderRadius: '6px', fontSize: '16px' }}>BDM</div>
            <div>
              <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>BENDEMEN POS</h1>
              <span style={{ fontSize: '13px', color: '#666' }}>Winkel: <strong>{selectedStore?.name || 'Laden...'}</strong></span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            {currentUser?.role === 'administrator' && (
              <button 
                onClick={() => router.push('/admin')}
                style={{ padding: '10px 16px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}
              >
                Admin Paneel
              </button>
            )}
            <button 
              onClick={() => {
                localStorage.removeItem('selectedStore');
                router.push('/select-store');
              }}
              style={{ padding: '10px 16px', background: '#F1F3F4', color: '#333', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}
            >
              Winkel Wisselen
            </button>
          </div>
        </div>

        {/* Kassascherm Inhoud */}
        <div style={{ background: '#FAFAFA', padding: '40px', borderRadius: '12px', border: '1px solid #EAEAEA', textAlign: 'center' }}>
          <h2 style={{ fontSize: '22px', fontWeight: '800', marginBottom: '10px' }}>Kassa Systeem Actief</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>Welkom, {currentUser?.firstName || currentUser?.username}. Actieve vestiging: <strong>{selectedStore?.name || 'Onbekend'}</strong> ({selectedStore?.location || 'Geen locatie'})</p>
        </div>

      </div>
    </div>
  );
}