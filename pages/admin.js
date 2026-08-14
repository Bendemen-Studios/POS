import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import axios from 'axios';

const fetcher = (url) => axios.get(url).then((res) => res.data);

export default function AdminDashboard() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('stores'); // 'stores', 'staff', 'sumup', 'orders', 'products'

  // Multi-Store State
  const [stores, setStores] = useState([
    { id: 1, name: 'Ons Winkeltje', location: 'Hellevoetsluis', email: 'info@onswinkeltje.nl', active: true, sumupReaderId: '' },
    { id: 2, name: 'Bendemen HQ', location: 'Hellevoetsluis', email: 'info@bendemen.nl', active: true, sumupReaderId: '' }
  ]);
  const [editingStore, setEditingStore] = useState(null);
  const [showAddStoreModal, setShowAddStoreModal] = useState(false);
  const [newStoreData, setNewStoreData] = useState({ name: '', location: '', email: '' });

  // Personeelsbeheer State
  const [staffList, setStaffList] = useState([
    { id: 1, name: 'Ben van der Leeden', role: 'administrator', pin: '1234', active: true },
    { id: 2, name: 'Kassamedewerker 1', role: 'cashier', pin: '0000', active: true }
  ]);
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [newStaffData, setNewStaffData] = useState({ name: '', role: 'cashier', pin: '' });

  // SumUp Pairing per Locatie State
  const [selectedStoreForSumup, setSelectedStoreForSumup] = useState('1');
  const [pairingCode, setPairingCode] = useState('');
  const [isPairingSumup, setIsPairingSumup] = useState(false);

  // WooCommerce Producten ophalen
  const { data: productsData, mutate: mutateProducts } = useSWR('/api/woocommerce/products', fetcher);
  const products = Array.isArray(productsData) ? productsData : (productsData?.products || []);

  useEffect(() => {
    setMounted(true);

    // Beveiligingscontrole voor Admins & Managers
    try {
      const rawUser = localStorage.getItem('pos_user');
      if (rawUser && rawUser !== 'undefined') {
        const parsedUser = JSON.parse(rawUser);
        setUser(parsedUser);
        if (parsedUser.role !== 'administrator' && parsedUser.role !== 'manager' && parsedUser.role !== 'shop_manager') {
          router.push('/');
        }
      } else {
        router.push('/login');
      }
    } catch (e) {
      router.push('/login');
    }

    // Laad lokale gegevens
    try {
      const savedStores = localStorage.getItem('pos_stores');
      if (savedStores) {
        const parsedStores = JSON.parse(savedStores);
        setStores(parsedStores);
        if (parsedStores.length > 0) setSelectedStoreForSumup(parsedStores[0].id.toString());
      }

      const savedStaff = localStorage.getItem('pos_staff');
      if (savedStaff) setStaffList(JSON.parse(savedStaff));
    } catch (e) { 
      console.error('Fout bij laden admin data:', e); 
    }
  }, [router]);

  if (!mounted || !user) return null;

  // --- 1. MULTI-STORE BEHEER ACTIES ---
  const saveStoresToStorage = (updatedStores) => {
    setStores(updatedStores);
    localStorage.setItem('pos_stores', JSON.stringify(updatedStores));
  };

  const handleToggleStoreActive = (id) => {
    const updated = stores.map(s => s.id === id ? { ...s, active: !s.active } : s);
    saveStoresToStorage(updated);
  };

  const handleDeleteStore = (id) => {
    if (confirm('Weet je zeker dat je deze winkel definitief wilt verwijderen?')) {
      const updated = stores.filter(s => s.id !== id);
      saveStoresToStorage(updated);
    }
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
      location: newStoreData.location || 'Hellevoetsluis',
      email: newStoreData.email || '',
      active: true,
      sumupReaderId: ''
    };
    const updated = [...stores, newStore];
    saveStoresToStorage(updated);
    setNewStoreData({ name: '', location: '', email: '' });
    setShowAddStoreModal(false);
  };

  // --- 2. PERSONEEL ACTIES ---
  const saveStaffToStorage = (updatedStaff) => {
    setStaffList(updatedStaff);
    localStorage.setItem('pos_staff', JSON.stringify(updatedStaff));
  };

  const handleAddStaff = () => {
    if (!newStaffData.name) return alert('Vul een naam in.');
    const newMember = {
      id: Date.now(),
      name: newStaffData.name,
      role: newStaffData.role,
      pin: newStaffData.pin || '0000',
      active: true
    };
    const updated = [...staffList, newMember];
    saveStaffToStorage(updated);
    setNewStaffData({ name: '', role: 'cashier', pin: '' });
    setShowAddStaffModal(false);
  };

  const handleDeleteStaff = (id) => {
    if (confirm('Medewerker verwijderen uit het kassasysteem?')) {
      const updated = staffList.filter(s => s.id !== id);
      saveStaffToStorage(updated);
    }
  };

  // --- 3. SUMUP PAIRING PER LOCATIE ---
  const handlePairSumup = async () => {
    if (!pairingCode) {
      return alert('Vul de pairing code in die op het scherm van de SumUp staat.');
    }

    const targetStore = stores.find(s => s.id === parseInt(selectedStoreForSumup));
    if (!targetStore) return alert('Selecteer een geldige winkel.');

    try {
      setIsPairingSumup(true);
      const res = await axios.post('/api/sumup/pair', {
        storeId: targetStore.id,
        pairingCode: pairingCode.trim(),
        readerName: `Bendemen POS - ${targetStore.name}`
      });

      if (res.data.success) {
        const readerId = res.data.reader?.id || pairingCode.trim();
        const updatedStores = stores.map(s => s.id === targetStore.id ? { ...s, sumupReaderId: readerId } : s);
        saveStoresToStorage(updatedStores);

        alert(`SumUp Terminal succesvol gekoppeld aan vestiging "${targetStore.name}"!`);
        setPairingCode('');
      } else {
        alert('Koppelen mislukt: ' + res.data.error);
      }
    } catch (err) {
      alert('Fout bij versturen koppelcode: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsPairingSumup(false);
    }
  };

  return (
    <div style={{ background: '#F8F9FA', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '20px' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFF', padding: '20px 25px', borderRadius: '12px', border: '1px solid #EAEAEA', marginBottom: '20px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '800' }}>BENDEMEN POS - Admin Paneel</h1>
            <span style={{ fontSize: '13px', color: '#666' }}>Ingelogd als: <strong>{user.name || user.username || 'Administrator'}</strong></span>
          </div>
          <button 
            onClick={() => router.push('/')} 
            style={{ padding: '10px 18px', background: '#000', color: '#FFF', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}
          >
            ← Terug naar Kassa
          </button>
        </div>

        {/* Tab Navigatie Menu */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
          {[
            { id: 'stores', label: '🏪 Multi-Store' },
            { id: 'staff', label: '👥 Personeel' },
            { id: 'sumup', label: '💳 SumUp per Locatie' },
            { id: 'orders', label: '📊 Bestellingen' },
            { id: 'products', label: '📦 Voorraad' }
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
                fontSize: '13px',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* --- TAB 1: MULTI-STORE BEHEER --- */}
        {activeTab === 'stores' && (
          <div style={{ background: '#FFF', padding: '25px', borderRadius: '12px', border: '1px solid #EAEAEA' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>Winkel / Vestigingen Beheer</h3>
                <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '13px' }}>Beheer, deactiveer of verwijder winkellocaties gekoppeld aan de kassa.</p>
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
                  <th style={{ padding: '12px' }}>SumUp Reader ID</th>
                  <th style={{ padding: '12px' }}>Status</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>Acties</th>
                </tr>
              </thead>
              <tbody>
                {stores.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #EAEAEA' }}>
                    <td style={{ padding: '12px', fontWeight: '700' }}>{s.name}</td>
                    <td style={{ padding: '12px', color: '#555' }}>{s.location}</td>
                    <td style={{ padding: '12px', fontFamily: 'monospace', fontWeight: 'bold', color: s.sumupReaderId ? '#137333' : '#888' }}>
                      {s.sumupReaderId || 'Nog niet gekoppeld'}
                    </td>
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
                        style={{ padding: '6px 12px', background: s.active ? '#FFF0F0' : '#EAEAEA', color: s.active ? '#C3110C' : '#333', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', marginRight: '6px' }}
                      >
                        {s.active ? 'Deactiveren' : 'Activeren'}
                      </button>
                      
                      {/* Verwijderknop */}
                      <button 
                        onClick={() => handleDeleteStore(s.id)}
                        style={{ padding: '6px 12px', background: '#FCE8E6', color: '#C3110C', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', fontSize: '12px' }}
                      >
                        🗑️ Verwijderen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* --- TAB 2: PERSONEELSBEHEER --- */}
        {activeTab === 'staff' && (
          <div style={{ background: '#FFF', padding: '25px', borderRadius: '12px', border: '1px solid #EAEAEA' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>Personeel & Medewerkers</h3>
                <p style={{ margin: '4px 0 0 0', color: '#666', fontSize: '13px' }}>Beheer wie er op de kassa kan inloggen en hun toegangsrechten.</p>
              </div>
              <button 
                onClick={() => setShowAddStaffModal(true)}
                style={{ padding: '10px 16px', background: '#000', color: '#FFF', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}
              >
                + Medewerker Toevoegen
              </button>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #EAEAEA', background: '#FAFAFA' }}>
                  <th style={{ padding: '12px' }}>Naam</th>
                  <th style={{ padding: '12px' }}>Rol</th>
                  <th style={{ padding: '12px' }}>PIN Code</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>Acties</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map(member => (
                  <tr key={member.id} style={{ borderBottom: '1px solid #EAEAEA' }}>
                    <td style={{ padding: '12px', fontWeight: '700' }}>{member.name}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ padding: '4px 8px', background: '#F1F3F4', borderRadius: '4px', fontSize: '11px', fontWeight: '700' }}>
                        {member.role === 'administrator' ? 'Administrator' : member.role === 'manager' ? 'Manager' : 'Kassamedewerker'}
                      </span>
                    </td>
                    <td style={{ padding: '12px', letterSpacing: '2px', fontWeight: 'bold' }}>••••</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <button 
                        onClick={() => handleDeleteStaff(member.id)}
                        style={{ padding: '6px 12px', background: '#FCE8E6', color: '#C3110C', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', fontSize: '12px' }}
                      >
                        🗑️ Verwijderen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* --- TAB 3: SUMUP PAIRING PER LOCATIE --- */}
        {activeTab === 'sumup' && (
          <div style={{ background: '#FFF', padding: '25px', borderRadius: '12px', border: '1px solid #EAEAEA' }}>
            <h3 style={{ marginTop: 0, fontSize: '18px', fontWeight: '800' }}>SumUp PIN Terminal Koppelen per Locatie</h3>
            <p style={{ color: '#666', fontSize: '13px', marginBottom: '20px' }}>Selecteer een vestiging en voer de Pairing Code in die verschijnt op de te koppelen SumUp Solo reader.</p>

            <div style={{ background: '#FAFAFA', padding: '20px', borderRadius: '8px', border: '1px solid #EAEAEA', maxWidth: '500px' }}>
              
              {/* Locatie Kiezer */}
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '5px' }}>Kies Winkellocatie</label>
                <select 
                  value={selectedStoreForSumup} 
                  onChange={(e) => setSelectedStoreForSumup(e.target.value)}
                  style={{ width: '100%', padding: '10px', fontSize: '14px', border: '1px solid #CCC', borderRadius: '6px', background: '#FFF', fontWeight: '600' }}
                >
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.location}) {s.sumupReaderId ? '— [Gekoppeld: ' + s.sumupReaderId + ']' : '— [Nog geen terminal]'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Pairing Code Invoer */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px' }}>SumUp Pairing Code (van terminal scherm)</label>
                <input 
                  type="text" 
                  value={pairingCode} 
                  onChange={(e) => setPairingCode(e.target.value)} 
                  placeholder="bijv. 8-tekens koppelcode"
                  style={{ width: '100%', padding: '12px', fontSize: '16px', fontWeight: 'bold', border: '2px solid #000', borderRadius: '6px', boxSizing: 'border-box' }}
                />
              </div>

              <button 
                onClick={handlePairSumup} 
                disabled={isPairingSumup}
                style={{ width: '100%', padding: '12px', background: '#000', color: '#FFF', border: 'none', borderRadius: '6px', fontWeight: '700', cursor: 'pointer' }}
              >
                {isPairingSumup ? 'Koppelen met SumUp API...' : '🔗 Terminal Koppelen aan Deze Locatie'}
              </button>
            </div>
          </div>
        )}

        {/* --- TAB 4: BESTELLINGEN --- */}
        {activeTab === 'orders' && (
          <div style={{ background: '#FFF', padding: '25px', borderRadius: '12px', border: '1px solid #EAEAEA' }}>
            <h3 style={{ marginTop: 0, fontSize: '18px', fontWeight: '800' }}>Verkoopoverzicht</h3>
            <p style={{ color: '#666', fontSize: '14px' }}>Hier kun je recente kassa-transacties inzien die doorgestuurd zijn naar WooCommerce.</p>
          </div>
        )}

        {/* --- TAB 5: PRODUCTEN & VOORRAAD --- */}
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
                    <th style={{ padding: '10px' }}>Voorraad</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #EAEAEA' }}>
                      <td style={{ padding: '10px', color: '#888' }}>#{p.id}</td>
                      <td style={{ padding: '10px', fontWeight: '600' }}>{p.name}</td>
                      <td style={{ padding: '10px', color: '#C3110C', fontWeight: 'bold' }}>{parseFloat(p.price) > 0 ? `€${p.price}` : 'Open Bedrag'}</td>
                      <td style={{ padding: '10px' }}>{p.stock_quantity !== null ? p.stock_quantity : 'N.v.t.'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* --- POP-UP MODAL: WINKEL BEWERKEN --- */}
      {editingStore && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#FFF', padding: '25px', borderRadius: '12px', width: '400px' }}>
            <h3 style={{ marginTop: 0, fontSize: '18px', fontWeight: '800' }}>Winkel Wijzigen</h3>
            <div style={{ margin: '15px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="text" value={editingStore.name} onChange={(e) => setEditingStore({ ...editingStore, name: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #CCC', borderRadius: '6px', boxSizing: 'border-box' }} />
              <input type="text" value={editingStore.location} onChange={(e) => setEditingStore({ ...editingStore, location: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #CCC', borderRadius: '6px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setEditingStore(null)} style={{ padding: '10px 15px', background: '#F1F3F4', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Annuleren</button>
              <button onClick={handleSaveEditStore} style={{ padding: '10px 15px', background: '#000', color: '#FFF', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Opslaan</button>
            </div>
          </div>
        </div>
      )}

      {/* --- POP-UP MODAL: PERSONEEL TOEVOEGEN --- */}
      {showAddStaffModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#FFF', padding: '25px', borderRadius: '12px', width: '400px' }}>
            <h3 style={{ marginTop: 0, fontSize: '18px', fontWeight: '800' }}>Nieuwe Medewerker</h3>
            <div style={{ margin: '15px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="text" placeholder="Naam medewerker" value={newStaffData.name} onChange={(e) => setNewStaffData({ ...newStaffData, name: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #CCC', borderRadius: '6px', boxSizing: 'border-box' }} />
              <select value={newStaffData.role} onChange={(e) => setNewStaffData({ ...newStaffData, role: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #CCC', borderRadius: '6px' }}>
                <option value="cashier">Kassamedewerker</option>
                <option value="manager">Manager</option>
                <option value="administrator">Administrator</option>
              </select>
              <input type="password" placeholder="PIN Code (4 cijfers)" maxLength={4} value={newStaffData.pin} onChange={(e) => setNewStaffData({ ...newStaffData, pin: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #CCC', borderRadius: '6px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddStaffModal(false)} style={{ padding: '10px 15px', background: '#F1F3F4', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Annuleren</button>
              <button onClick={handleAddStaff} style={{ padding: '10px 15px', background: '#000', color: '#FFF', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Toevoegen</button>
            </div>
          </div>
        </div>
      )}

      {/* --- POP-UP MODAL: WINKEL TOEVOEGEN --- */}
      {showAddStoreModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#FFF', padding: '25px', borderRadius: '12px', width: '400px' }}>
            <h3 style={{ marginTop: 0, fontSize: '18px', fontWeight: '800' }}>Nieuwe Winkel Toevoegen</h3>
            <div style={{ margin: '15px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input type="text" placeholder="Winkelnaam" value={newStoreData.name} onChange={(e) => setNewStoreData({ ...newStoreData, name: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #CCC', borderRadius: '6px', boxSizing: 'border-box' }} />
              <input type="text" placeholder="Locatie (bijv. Hellevoetsluis)" value={newStoreData.location} onChange={(e) => setNewStoreData({ ...newStoreData, location: e.target.value })} style={{ width: '100%', padding: '10px', border: '1px solid #CCC', borderRadius: '6px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAddStoreModal(false)} style={{ padding: '10px 15px', background: '#F1F3F4', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Annuleren</button>
              <button onClick={handleAddStore} style={{ padding: '10px 15px', background: '#C3110C', color: '#FFF', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Toevoegen</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}