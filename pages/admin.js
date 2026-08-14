import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import axios from 'axios';

const fetcher = (url) => axios.get(url).then((res) => res.data);

export default function AdminDashboard() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('stores'); // Default op 'stores' gezet

  // Multi-Store State
  const [stores, setStores] = useState([
    { id: 1, name: 'Ons Winkeltje', location: 'Hellevoetsluis', email: 'info@onswinkeltje.nl', active: true },
    { id: 2, name: 'Bendemen HQ', location: 'Hellevoetsluis', email: 'info@bendemen.nl', active: true }
  ]);
  const [editingStore, setEditingStore] = useState(null);
  const [showAddStoreModal, setShowAddStoreModal] = useState(false);
  const [newStoreData, setNewStoreData] = useState({ name: '', location: '', email: '' });

  // Data ophalen via SWR
  const { data: productsData, mutate: mutateProducts } = useSWR('/api/woocommerce/products', fetcher);
  const products = Array.isArray(productsData) ? productsData : (productsData?.products || []);

  useEffect(() => {
    setMounted(true);
    try {
      const rawUser = localStorage.getItem('pos_user');
      if (rawUser && rawUser !== 'undefined') {
        const parsedUser = JSON.parse(rawUser);
        setUser(parsedUser);
        if (parsedUser.role !== 'administrator') {
          router.push('/');
        }
      } else {
        router.push('/login');
      }
    } catch (e) {
      router.push('/login');
    }

    // Laad opgeslagen winkels uit localStorage indien aanwezig
    try {
      const savedStores = localStorage.getItem('pos_stores');
      if (savedStores) setStores(JSON.parse(savedStores));
    } catch (e) { console.error('Fout bij laden stores:', e); }
  }, [router]);

  if (!mounted || !user) return null;

  // Multi-Store acties
  const saveStoresToStorage = (updatedStores) => {
    setStores(updatedStores);
    localStorage.setItem('pos_stores', JSON.stringify(updatedStores));
  };

  const handleToggleStoreActive = (id) => {
    const updated = stores.map(s => s.id === id ? { ...s, active: !s.active } : s);
    saveStoresToStorage(updated);
  };

  const handleSaveEditStore = () => {
    if (!editingStore.name) return alert('Vul een winkelnaam in.');
    const updated = stores.map(s => s.id === editingStore.id ? editingStore : s);
    saveStoresToStorage(updated);
    setEditingStore(null);
  };

  const handleAddStore = () => {
    if (!newStoreData.name) return alert('Vul een winkelnaam in.');
    const newStore = {
      id: Date.now(),
      name: newStoreData.name,
      location: newStoreData.location || 'Onbekend',
      email: newStoreData.email || '',
      active: true
    };
    const updated = [...stores, newStore];
    saveStoresToStorage(updated);
    setNewStoreData({ name: '', location: '', email: '' });
    setShowAddStoreModal(false);
  };

  return (
    <div style={{ background: '#F8F9FA', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '20px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFF', padding: '20px 25px', borderRadius: '12px', border: '1px solid #EAEAEA', marginBottom: '20px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '800' }}>BENDEMEN POS - Admin</h1>
            <span style={{ fontSize: '13px', color: '#666' }}>Ingelogd als: <strong>{user.name || user.username || 'Administrator'}</strong></span>
          </div>
          <button 
            onClick={() => router.push('/')} 
            style={{ padding: '10px 18px', background: '#000', color: '#FFF', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}
          >
            ← Terug naar Kassa
          </button>
        </div>

        {/* Tab Navigatie */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          {[
            { id: 'stores', label: '🏪 Multi-Store Beheer' },
            { id: 'orders', label: '📊 Bestellingen & Omzet' },
            { id: 'products', label: '📦 Voorraad & Producten' },
            { id: 'settings', label: '⚙️ Instellingen' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '12px 20px',
                background: activeTab === tab.id ? '#000' : '#FFF',
                color: activeTab === tab.id ? '#FFF' : '#333',
                border: '1px solid #EAEAEA',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '13px'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: MULTI-STORE BEHEER */}
        {activeTab === 'stores' && (
          <div style={{ background: '#FFF', padding: '25px', borderRadius: '12px', border: '1px solid #EAEAEA' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>Winkel / Vestigingen Beheer</h3>
                <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '13px' }}>Beheer hier de verschillende winkellocaties die gekoppeld zijn aan de kassa.</p>
              </div>
              <button 
                onClick={() => setShowAddStoreModal(true)}
                style={{ padding: '10px 16px', background: '#C3110C', color: '#FFF', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}
              >
                + Nieuwe Winkel Toevoegen
              </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #EAEAEA', background: '#FAFAFA' }}>
                  <th style={{ padding: '12px' }}>Winkelnaam</th>
                  <th style={{ padding: '12px' }}>Locatie</th>
                  <th style={{ padding: '12px' }}>E-mail</th>
                  <th style={{ padding: '12px' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>Acties</th>
                </tr>
              </thead>
              <tbody>
                {stores.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #EAEAEA' }}>
                    <td style={{ padding: '12px', fontWeight: '700' }}>{s.name}</td>
                    <td style={{ padding: '12px', color: '#555' }}>{s.location}</td>
                    <td style={{ padding: '12px', color: '#555' }}>{s.email || '-'}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', background: s.active ? '#E6F4EA' : '#FCE8E6', color: s.active ? '#137333' : '#C3110C' }}>
                        {s.active ? 'Actief' : 'Inactief'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <button 
                        onClick={() => setEditingStore(s)}
                        style={{ padding: '6px 12px', background: '#F1F3F4', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', marginRight: '6px' }}
                      >
                        ✏️ Wijzigen
                      </button>
                      <button 
                        onClick={() => handleToggleStoreActive(s.id)}
                        style={{ padding: '6px 12px', background: s.active ? '#FFF0F0' : '#EAEAEA', color: s.active ? '#C3110C' : '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}
                      >
                        {s.active ? 'Deactiveren' : 'Activeren'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: BESTELLINGEN */}
        {activeTab === 'orders' && (
          <div style={{ background: '#FFF', padding: '25px', borderRadius: '12px', border: '1px solid #EAEAEA' }}>
            <h3 style={{ marginTop: 0, fontSize: '18px', fontWeight: '800' }}>Verkoopoverzicht</h3>
            <p style={{ color: '#666', fontSize: '14px' }}>Hier kun je recente transacties inzien die via de kassa of webshop zijn geplaatst.</p>
            <div style={{ background: '#FAFAFA', padding: '20px', borderRadius: '8px', border: '1px solid #EEE', textAlign: 'center', color: '#888', marginTop: '15px' }}>
              Wordt gesynchroniseerd met WooCommerce orders...
            </div>
          </div>
        )}

        {/* TAB 3: PRODUCTEN */}
        {activeTab === 'products' && (
          <div style={{ background: '#FFF', padding: '25px', borderRadius: '12px', border: '1px solid #EAEAEA' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>Producten & Voorraad ({products.length})</h3>
              <button onClick={() => mutateProducts()} style={{ padding: '8px 14px', background: '#F1F3F4', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}>🔄 Verversen</button>
            </div>
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #EAEAEA', background: '#FAFAFA' }}>
                    <th style={{ padding: '10px' }}>ID</th>
                    <th style={{ padding: '10px' }}>Naam</th>
                    <th style={{ padding: '10px' }}>Prijs</th>
                    <th style={{ padding: '10px' }}>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #EAEAEA' }}>
                      <td style={{ padding: '10px', color: '#888' }}>#{p.id}</td>
                      <td style={{ padding: '10px', fontWeight: '600' }}>{p.name}</td>
                      <td style={{ padding: '10px', color: '#C3110C', fontWeight: 'bold' }}>{parseFloat(p.price) > 0 ? `€${p.price}` : 'Open Bedrag'}</td>
                      <td style={{ padding: '10px' }}><span style={{ padding: '3px 8px', background: '#F1F3F4', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>{p.type}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: INSTELLINGEN */}
        {activeTab === 'settings' && (
          <div style={{ background: '#FFF', padding: '25px', borderRadius: '12px', border: '1px solid #EAEAEA' }}>
            <h3 style={{ marginTop: 0, fontSize: '18px', fontWeight: '800' }}>Algemene Instellingen</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '400px', marginTop: '15px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '5px' }}>Standaard Betaalmethode</label>
                <select style={{ width: '100%', padding: '10px', border: '1px solid #DDD', borderRadius: '6px' }}>
                  <option>SumUp PIN</option>
                  <option>PIN Handmatig</option>
                  <option>Contant</option>
                </select>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* --- POP-UP MODAL: WINKEL WIJZIGEN --- */}
      {editingStore && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#FFF', padding: '25px', borderRadius: '12px', width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, fontSize: '18px', fontWeight: '800' }}>Winkel Wijzigen</h3>
            
            <div style={{ margin: '15px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px' }}>Winkelnaam</label>
                <input 
                  type="text" 
                  value={editingStore.name} 
                  onChange={(e) => setEditingStore({ ...editingStore, name: e.target.value })} 
                  style={{ width: '100%', padding: '10px', border: '1px solid #CCC', borderRadius: '6px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px' }}>Locatie / Stad</label>
                <input 
                  type="text" 
                  value={editingStore.location} 
                  onChange={(e) => setEditingStore({ ...editingStore, location: e.target.value })} 
                  style={{ width: '100%', padding: '10px', border: '1px solid #CCC', borderRadius: '6px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px' }}>E-mailadres</label>
                <input 
                  type="email" 
                  value={editingStore.email} 
                  onChange={(e) => setEditingStore({ ...editingStore, email: e.target.value })} 
                  style={{ width: '100%', padding: '10px', border: '1px solid #CCC', borderRadius: '6px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditingStore(null)} style={{ padding: '10px 15px', background: '#F1F3F4', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>Annuleren</button>
              <button onClick={handleSaveEditStore} style={{ padding: '10px 15px', background: '#000', color: '#FFF', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>Opslaan</button>
            </div>
          </div>
        </div>
      )}

      {/* --- POP-UP MODAL: NIEUWE WINKEL TOEVOEGEN --- */}
      {showAddStoreModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#FFF', padding: '25px', borderRadius: '12px', width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, fontSize: '18px', fontWeight: '800' }}>Nieuwe Winkel Toevoegen</h3>
            
            <div style={{ margin: '15px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px' }}>Winkelnaam</label>
                <input 
                  type="text" 
                  placeholder="bijv. Bendemen Pop-Up Store" 
                  value={newStoreData.name} 
                  onChange={(e) => setNewStoreData({ ...newStoreData, name: e.target.value })} 
                  style={{ width: '100%', padding: '10px', border: '1px solid #CCC', borderRadius: '6px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px' }}>Locatie / Stad</label>
                <input 
                  type="text" 
                  placeholder="bijv. Hellevoetsluis" 
                  value={newStoreData.location} 
                  onChange={(e) => setNewStoreData({ ...newStoreData, location: e.target.value })} 
                  style={{ width: '100%', padding: '10px', border: '1px solid #CCC', borderRadius: '6px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '4px' }}>E-mailadres</label>
                <input 
                  type="email" 
                  placeholder="winkel@bendemen.nl" 
                  value={newStoreData.email} 
                  onChange={(e) => setNewStoreData({ ...newStoreData, email: e.target.value })} 
                  style={{ width: '100%', padding: '10px', border: '1px solid #CCC', borderRadius: '6px', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddStoreModal(false)} style={{ padding: '10px 15px', background: '#F1F3F4', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>Annuleren</button>
              <button onClick={handleAddStore} style={{ padding: '10px 15px', background: '#C3110C', color: '#FFF', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>Toevoegen</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}