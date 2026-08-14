import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import useSWR from 'swr';
import axios from 'axios';

const fetcher = (url) => axios.get(url).then((res) => res.data);

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [activeTab, setActiveTab] = useState('stores');

  // Locaties / Winkels State
  const [stores, setStores] = useState([]);
  const [editingStore, setEditingStore] = useState(null);
  const [showAddStoreModal, setShowAddStoreModal] = useState(false);
  const [newStoreData, setNewStoreData] = useState({ store_name: '', address: '', receipt_header: '', receipt_footer: '', pickup_id: '' });

  // Personeel State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [newUserData, setNewUserData] = useState({ username: '', password: '', role: 'cashier', store_id: '' });

  // SumUp per Locatie State
  const [selectedStoreForSumup, setSelectedStoreForSumup] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [isPairingSumup, setIsPairingSumup] = useState(false);

  // Live Orders State & Functies
  const [liveOrders, setLiveOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const { data: usersData, mutate: mutateUsers } = useSWR('/api/admin/users', fetcher);
  const usersList = usersData?.users || [];

  const { data: productsData } = useSWR('/api/woocommerce/products', fetcher);
  const products = productsData?.products || [];

  const fetchLiveOrders = async () => {
    try {
      setLoadingOrders(true);
      const res = await axios.get('/api/woocommerce/orders'); 
      if (res.data.success && res.data.orders) {
        setLiveOrders(res.data.orders);
      }
    } catch (err) {
      console.error('Fout bij ophalen live orders:', err);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId, newStatus) => {
    try {
      const res = await axios.post('/api/woocommerce/update-order-status', { orderId, status: newStatus });
      if (res.data.success) {
        setLiveOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      } else {
        alert('Kon status niet wijzigen.');
      }
    } catch (err) {
      alert('Fout bij updaten orderstatus.');
    }
  };

  useEffect(() => {
    const userStr = localStorage.getItem('pos_user');
    if (!userStr) { router.push('/login'); return; }

    try {
      const parsedUser = JSON.parse(userStr);
      if (parsedUser.role !== 'admin' && parsedUser.role !== 'super_admin') {
        alert('Geen toegang tot het Admin Panel.');
        router.push('/');
        return;
      }
      setUser(parsedUser);
    } catch (e) {
      router.push('/login');
      return;
    }

    const storeStr = localStorage.getItem('selectedStore');
    if (storeStr) {
      try { setSelectedStore(JSON.parse(storeStr)); } catch (e) {}
    }

    fetchStores();
    fetchLiveOrders();
  }, []);

  useEffect(() => {
    if (activeTab !== 'orders') return;
    const interval = setInterval(fetchLiveOrders, 15000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const fetchStores = async () => {
    try {
      const res = await fetch('/api/admin/store');
      const data = await res.json();
      if (data.success) {
        const storeArray = Array.isArray(data.stores) ? data.stores : (data.store ? [data.store] : []);
        setStores(storeArray);
        if (storeArray.length > 0) setSelectedStoreForSumup(storeArray[0].id.toString());
      }
    } catch (err) {
      console.error('Fout bij ophalen winkels:', err);
    }
  };

  const handleSaveStore = async (e) => {
    e.preventDefault();
    const payload = editingStore || newStoreData;
    try {
      const res = await fetch('/api/admin/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setEditingStore(null);
        setShowAddStoreModal(false);
        setNewStoreData({ store_name: '', address: '', receipt_header: '', receipt_footer: '', pickup_id: '' });
        fetchStores();
      } else {
        alert(data.message || 'Fout bij opslaan.');
      }
    } catch (err) {
      alert('Fout bij opslaan locatie.');
    }
  };

  const handleDeleteStore = async (id) => {
    if (!confirm('Weet je zeker dat je deze locatie wilt verwijderen?')) return;
    try {
      await fetch(`/api/admin/store?id=${id}`, { method: 'DELETE' });
      fetchStores();
    } catch (err) {
      alert('Fout bij verwijderen.');
    }
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    try {
      const isEditing = !!editingUser;
      const url = '/api/admin/users';
      const method = isEditing ? 'PUT' : 'POST';
      
      // Kopieer data en forceer store_id naar een integer of null
      const payload = isEditing ? { ...editingUser } : { ...newUserData };
      payload.store_id = payload.store_id !== '' && payload.store_id !== null ? parseInt(payload.store_id, 10) : null;

      const res = await axios({ method, url, data: payload });
      if (res.data.success) {
        setShowAddUserModal(false);
        setEditingUser(null);
        setNewUserData({ username: '', password: '', role: 'cashier', store_id: '' });
        mutateUsers();
      } else {
        alert(res.data.message || 'Fout bij opslaan medewerker.');
      }
    } catch (err) {
      console.error(err);
      alert('Fout bij opslaan medewerker.');
    }
  };

  const handleDeleteUser = async (id) => {
    if (!confirm('Weet je zeker dat je deze medewerker wilt verwijderen?')) return;
    try {
      const res = await axios.delete(`/api/admin/users?id=${id}`);
      if (res.data.success) mutateUsers();
      else alert(res.data.message || 'Kan gebruiker niet verwijderen.');
    } catch (err) {
      alert('Fout bij verwijderen medewerker.');
    }
  };

  const handlePairSumup = async () => {
    if (!pairingCode) return alert('Voer de pairing code in.');
    const targetStore = stores.find(s => s.id === parseInt(selectedStoreForSumup));
    try {
      setIsPairingSumup(true);
      const res = await axios.post('/api/sumup/pair', {
        storeId: selectedStoreForSumup,
        pairingCode: pairingCode.trim(),
        readerName: `BDM POS - ${targetStore?.store_name || 'Locatie'}`
      });
      if (res.data.success) {
        alert('SumUp Terminal gekoppeld!');
        setPairingCode('');
      } else {
        alert('Koppelen mislukt: ' + res.data.error);
      }
    } catch (err) {
      alert('Fout bij koppelen SumUp.');
    } finally {
      setIsPairingSumup(false);
    }
  };

  if (!user) return <div className="p-8 text-center font-bold">Laden...</div>;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-black text-white p-4 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-3">
          <span className="font-bold text-xl tracking-wider">BDM POS</span>
          {selectedStore && (
            <span className="text-xs bg-red-600 px-2.5 py-1 rounded-md font-bold uppercase flex items-center space-x-1 shadow-sm">
              <span>📍</span>
              <span>{selectedStore.store_name}</span>
            </span>
          )}
          <span className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded">
            {user.username} ({user.role})
          </span>
        </div>
        <Link href="/">
          <button className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded text-xs font-semibold transition">
            ← Terug naar Kassa
          </button>
        </Link>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b px-6 py-2 flex space-x-2 overflow-x-auto">
        {[
          { id: 'stores', label: '🏪 Locaties & Filialen' },
          { id: 'users', label: '👥 Personeel & Toegang' },
          { id: 'sumup', label: '💳 SumUp per Locatie' },
          { id: 'orders', label: '📊 Bestellingen Live' },
          { id: 'products', label: '📦 Voorraad' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-xs font-bold rounded transition ${activeTab === tab.id ? 'bg-black text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-6 max-w-6xl mx-auto w-full">
        {activeTab === 'stores' && (
          <div className="bg-white p-6 rounded-lg shadow space-y-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-bold">🏪 Winkel & Filiaal Locaties</h2>
              <button onClick={() => setShowAddStoreModal(true)} className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded text-xs transition">
                + Nieuwe Locatie Toevoegen
              </button>
            </div>
            <table className="w-full text-left text-xs divide-y">
              <thead>
                <tr className="bg-gray-50"><th className="p-3">Locatienaam</th><th className="p-3">Adres</th><th className="p-3">Pickup ID</th><th className="p-3 text-right">Acties</th></tr>
              </thead>
              <tbody className="divide-y">
                {stores.map(s => (
                  <tr key={s.id}>
                    <td className="p-3 font-bold">{s.store_name}</td>
                    <td className="p-3 text-gray-600">{s.address || '—'}</td>
                    <td className="p-3 font-mono text-blue-600">{s.pickup_id || '—'}</td>
                    <td className="p-3 text-right space-x-2">
                      <button onClick={() => setEditingStore(s)} className="bg-gray-100 hover:bg-gray-200 font-bold px-3 py-1 rounded text-xs">✏️ Bewerken</button>
                      <button onClick={() => handleDeleteStore(s.id)} className="bg-red-100 hover:bg-red-200 text-red-700 font-bold px-3 py-1 rounded text-xs">🗑️ Verwijderen</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="bg-white p-6 rounded-lg shadow space-y-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-bold">👥 Personeel & Gebruikersbeheer</h2>
              <button onClick={() => { setEditingUser(null); setShowAddUserModal(true); }} className="bg-black text-white font-bold px-4 py-2 rounded text-xs">
                + Medewerker Toevoegen
              </button>
            </div>
            <table className="w-full text-left text-xs divide-y">
              <thead>
                <tr className="bg-gray-50"><th className="p-3">Gebruikersnaam</th><th className="p-3">Rol</th><th className="p-3">Locatie</th><th className="p-3 text-right">Acties</th></tr>
              </thead>
              <tbody className="divide-y">
                {usersList.map(u => {
                  const assignedStore = stores.find(s => s.id == u.store_id);
                  const isProtected = u.username.toLowerCase() === 'bendemen';
                  return (
                    <tr key={u.id}>
                      <td className="p-3 font-bold">{u.username} {isProtected && '👑'}</td>
                      <td className="p-3 uppercase text-gray-500 font-semibold">{u.role}</td>
                      <td className="p-3 text-red-600 font-semibold">{assignedStore ? `📍 ${assignedStore.store_name}` : 'Alle Locaties'}</td>
                      <td className="p-3 text-right space-x-2">
                        {isProtected ? (
                          <span className="bg-gray-100 text-gray-500 font-bold px-3 py-1 rounded text-xs">🔒 Systeem Account</span>
                        ) : (
                          <>
                            <button onClick={() => setEditingUser(u)} className="bg-gray-100 hover:bg-gray-200 font-bold px-3 py-1 rounded text-xs">✏️ Bewerken</button>
                            <button onClick={() => handleDeleteUser(u.id)} className="bg-red-100 hover:bg-red-200 text-red-700 font-bold px-3 py-1 rounded text-xs">🗑️ Verwijderen</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'sumup' && (
          <div className="bg-white p-6 rounded-lg shadow max-w-lg space-y-4">
            <h2 className="text-lg font-bold">💳 SumUp Terminal Koppelen</h2>
            <select value={selectedStoreForSumup} onChange={(e) => setSelectedStoreForSumup(e.target.value)} className="w-full p-2 border rounded text-sm font-bold">
              {stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}
            </select>
            <input type="text" placeholder="Pairing Code" value={pairingCode} onChange={(e) => setPairingCode(e.target.value)} className="w-full p-2 border-2 border-black rounded font-mono font-bold" />
            <button onClick={handlePairSumup} disabled={isPairingSumup} className="w-full bg-black text-white font-bold py-2 rounded text-sm">Koppel Terminal</button>
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="bg-white p-6 rounded-lg shadow space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">📊 Live Bestellingen ({liveOrders.length})</h2>
              <button onClick={fetchLiveOrders} className="bg-gray-100 hover:bg-gray-200 text-xs font-bold px-3 py-1.5 rounded">🔄 Verversen</button>
            </div>
            <table className="w-full text-left text-xs divide-y max-h-[500px]">
              <thead>
                <tr className="bg-gray-50"><th className="p-3">Order ID</th><th className="p-3">Datum</th><th className="p-3">Betaalmethode</th><th className="p-3">Status</th><th className="p-3 text-right">Totaal</th></tr>
              </thead>
              <tbody className="divide-y">
                {liveOrders.map(o => (
                  <tr key={o.id}>
                    <td className="p-3 font-bold">#{o.number || o.id}</td>
                    <td className="p-3 text-gray-500">{new Date(o.date_created || Date.now()).toLocaleString('nl-NL')}</td>
                    <td className="p-3">{o.payment_method_title || o.payment_method}</td>
                    <td className="p-3">
                      <select value={o.status} onChange={(e) => handleUpdateOrderStatus(o.id, e.target.value)} className="border p-1 rounded text-xs font-bold">
                        <option value="pending">In afwachting</option>
                        <option value="processing">In behandeling</option>
                        <option value="completed">Voltooid</option>
                        <option value="cancelled">Geannuleerd</option>
                      </select>
                    </td>
                    <td className="p-3 text-right font-bold text-red-600">€{parseFloat(o.total || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'products' && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-bold mb-4">📦 Producten ({products.length})</h2>
            <table className="w-full text-left text-xs divide-y">
              <thead><tr className="bg-gray-50"><th className="p-2">ID</th><th className="p-2">Naam</th><th className="p-2">Prijs</th><th className="p-2">Voorraad</th></tr></thead>
              <tbody>
                {products.map(p => (
                  <tr key={p.id}><td className="p-2 text-gray-400">#{p.id}</td><td className="p-2 font-semibold">{p.name}</td><td className="p-2 text-red-600 font-bold">€{p.price}</td><td className="p-2">{p.stock_quantity ?? 'N.v.t.'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: LOCATIE */}
      {(showAddStoreModal || editingStore) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-3">
            <h3 className="text-lg font-bold">{editingStore ? 'Locatie Bewerken' : 'Nieuwe Locatie'}</h3>
            <form onSubmit={handleSaveStore} className="space-y-3">
              <input type="text" value={editingStore ? editingStore.store_name : newStoreData.store_name} onChange={(e) => editingStore ? setEditingStore({...editingStore, store_name: e.target.value}) : setNewStoreData({...newStoreData, store_name: e.target.value})} placeholder="Winkelnaam" className="w-full p-2 border rounded text-sm" required />
              <input type="text" value={editingStore ? editingStore.address : newStoreData.address} onChange={(e) => editingStore ? setEditingStore({...editingStore, address: e.target.value}) : setNewStoreData({...newStoreData, address: e.target.value})} placeholder="Adres" className="w-full p-2 border rounded text-sm" />
              <input type="text" value={editingStore ? (editingStore.pickup_id || '') : newStoreData.pickup_id} onChange={(e) => editingStore ? setEditingStore({...editingStore, pickup_id: e.target.value}) : setNewStoreData({...newStoreData, pickup_id: e.target.value})} placeholder="Pickup ID (bijv. 342428)" className="w-full p-2 border rounded text-sm font-mono" />
              <input type="text" value={editingStore ? editingStore.receipt_header : newStoreData.receipt_header} onChange={(e) => editingStore ? setEditingStore({...editingStore, receipt_header: e.target.value}) : setNewStoreData({...newStoreData, receipt_header: e.target.value})} placeholder="Kassabon Header" className="w-full p-2 border rounded text-sm" />
              <input type="text" value={editingStore ? editingStore.receipt_footer : newStoreData.receipt_footer} onChange={(e) => editingStore ? setEditingStore({...editingStore, receipt_footer: e.target.value}) : setNewStoreData({...newStoreData, receipt_footer: e.target.value})} placeholder="Kassabon Footer" className="w-full p-2 border rounded text-sm" />
              <div className="flex space-x-2 pt-2">
                <button type="button" onClick={() => {setEditingStore(null); setShowAddStoreModal(false);}} className="w-1/2 bg-gray-200 p-2 rounded text-xs font-bold">Annuleren</button>
                <button type="submit" className="w-1/2 bg-red-600 text-white p-2 rounded text-xs font-bold">Opslaan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MEDEWERKER TOEVOEGEN / BEWERKEN */}
      {(showAddUserModal || editingUser) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-3">
            <h3 className="text-lg font-bold">{editingUser ? 'Medewerker Bewerken' : 'Nieuwe Medewerker'}</h3>
            <form onSubmit={handleSaveUser} className="space-y-3">
              {!editingUser && (
                <input type="text" placeholder="Gebruikersnaam" value={newUserData.username} onChange={(e) => setNewUserData({...newUserData, username: e.target.value})} className="w-full p-2 border rounded text-sm" required />
              )}
              <input type="password" placeholder={editingUser ? "Nieuw Wachtwoord (leeg laten = ongewijzigd)" : "Wachtwoord"} value={editingUser ? editingUser.password || '' : newUserData.password} onChange={(e) => editingUser ? setEditingUser({...editingUser, password: e.target.value}) : setNewUserData({...newUserData, password: e.target.value})} className="w-full p-2 border rounded text-sm" required={!editingUser} />
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Rol</label>
                <select value={editingUser ? editingUser.role : newUserData.role} onChange={(e) => editingUser ? setEditingUser({...editingUser, role: e.target.value}) : setNewUserData({...newUserData, role: e.target.value})} className="w-full p-2 border rounded text-sm">
                  <option value="cashier">Caissière</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Winkellocatie</label>
                <select value={editingUser ? (editingUser.store_id || '') : newUserData.store_id} onChange={(e) => editingUser ? setEditingUser({...editingUser, store_id: e.target.value}) : setNewUserData({...newUserData, store_id: e.target.value})} className="w-full p-2 border rounded text-sm">
                  <option value="">Alle Locaties</option>
                  {stores.map(s => <option key={s.id} value={s.id}>📍 {s.store_name}</option>)}
                </select>
              </div>
              <div className="flex space-x-2 pt-2">
                <button type="button" onClick={() => {setShowAddUserModal(false); setEditingUser(null);}} className="w-1/2 bg-gray-200 p-2 rounded text-xs font-bold">Annuleren</button>
                <button type="submit" className="w-1/2 bg-black text-white p-2 rounded text-xs font-bold">Opslaan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}