import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Home() {
  const router = useRouter();
  const [selectedStore, setSelectedStore] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const rawUser = localStorage.getItem('pos_user');
    const store = localStorage.getItem('selectedStore');

    if (!rawUser) {
      router.push('/login');
      return;
    }

    if (!store) {
      router.push('/select-store');
      return;
    }

    try {
      setCurrentUser(JSON.parse(rawUser));
      setSelectedStore(JSON.parse(store));
    } catch (e) {
      router.push('/select-store');
    }
  }, [router]);

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
          <p style={{ color: '#666', fontSize: '14px' }}>Welkom, {currentUser?.firstName || currentUser?.username}. Systeem draait lokaal en is gekoppeld aan de database.</p>
        </div>

      </div>
    </div>
  );
}