import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import useSWR from 'swr';
import axios from 'axios';

const fetcher = (url) => axios.get(url).then((res) => res.data);

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('stores'); // 'stores', 'users', 'sumup', 'orders', 'products'

  // Locaties / Winkels State
  const [stores, setStores] = useState([]);
  const [editingStore, setEditingStore] = useState(null);
  const [showAddStoreModal, setShowAddStoreModal] = useState(false);
  const [newStoreData, setNewStoreData] = useState({ store_name: '', address: '', receipt_header: '', receipt_footer: '' });

  // Personeel State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserData, setNewUserData] = useState({ username: '', password: '', role: 'cashier', store_id: '' });

  // SumUp per Locatie State
  const [selectedStoreForSumup, setSelectedStoreForSumup] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [isPairingSumup, setIsPairingSumup] = useState(false);

  // SWR Data Fetching
  const { data: usersData, mutate: mutateUsers } = useSWR('/api/admin/users', fetcher);
  const usersList = usersData?.users || [];

  const { data: productsData, mutate: mutateProducts } = useSWR('/api/woocommerce/products', fetcher);
  const products = productsData?.products || [];

  const { data: ordersData, mutate: mutateOrders } = useSWR('/api/woocommerce/orders', fetcher, { refreshInterval: 10000 });
  const orders = ordersData?.orders || [];

  useEffect(() => {
    const userStr = localStorage.getItem('pos_user');
    if (!userStr) {
      router.push('/login');
      return;
    }

    try {
      const parsedUser = JSON.parse(userStr);
      if (parsedUser.role !== 'admin' && parsedUser.role !== 'super_admin') {
        alert('Geen toegang tot het Admin Panel.');
        router.push('/');
        return;
      }
      setUser(parsedUser);
      fetchStores();
    } catch (e) {
      router.push('/login');
    }
  }, []);

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

  // --- LOCATIE ACTIES ---
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
        setNewStoreData({ store_name: '', address: '', receipt_header: '', receipt_footer: '' });
        fetchStores();
      } else {
        alert(data.message || 'Fout bij opslaan van de locatie.');
      }
    } catch (err) {
      alert('Fout bij communicatie met de server bij het opslaan.');
    }
  };

  const handleDeleteStore = async (id) => {
    if (!confirm('Weet je zeker dat je deze locatie wilt verwijderen?')) return;
    try {
      await fetch(`/api/admin/store?id=${id}`, { method: 'DELETE' });
      fetchStores();
    } catch (err) {
      alert('Fout bij verwijderen locatie.');
    }
  };

  // --- PERSONEEL ACTIES ---
  const handleAddUser = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUserData),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddUserModal(false);
        setNewUserData({ username: '', password: '', role: 'cashier', store_id: '' });
        mutateUsers();
      } else {
        alert(data.message || 'Fout bij aanmaken.');
      }
    } catch (err) {
      alert('Fout bij aanmaken medewerker.');
    }
  };

  const handleDeleteUser = async (id) => {
    if (!confirm('Weet je zeker dat je deze medewerker wilt verwijderen uit de kassa?')) return;
    try {
      const res = await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        mutateUsers();
      } else {
        alert(data.message || 'Fout bij verwijderen.');
      }
    } catch (err) {
      alert('Fout bij verwijderen medewerker.');
    }
  };

  // --- SUMUP PER LOCATIE ---
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
        alert(`SumUp Terminal gekoppeld aan locatie ${targetStore?.store_name || ''}!`);
        setPairingCode('');
      } else {
        alert('Koppelen mislukt: ' + res.data.error);
      }
    } catch (err) {
      alert('Fout bij koppelen SumUp: ' + (err.response?.data?.error || err.message));
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
          <span className="font-bold text-xl tracking-wider">BDM POS — ADMIN</span>
          <span className="text-xs bg-red-600 px-2 py-1 rounded font-semibold uppercase">{user.role}</span>
        </div>
        <Link href="/">
          <button className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded text-xs font-semibold transition">
            ← Terug naar Kassa
          </button>
        </Link>
      </header>

      {/* Navigation Tabs */}
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

      {/* Main Content */}
      <div className="p-6 max-w-6xl mx-auto w-full">

        {/* TAB 1: LOCATIES BEHEREN */}
        {activeTab === 'stores' && (
          <div className="bg-white p-6 rounded-lg shadow space-y-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-bold">🏪 Winkel & Filiaal Locaties</h2>
              <button
                onClick={() => setShowAddStoreModal(true)}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded text-xs transition"
              >
                + Nieuwe Locatie Toevoegen
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs divide-y">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="p-3">Locatienaam</th>
                    <th className="p-3">Adres</th>
                    <th className="p-3">Kassabon Header</th>
                    <th className="p-3 text-right">Acties</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stores.length === 0 ? (
                    <tr><td colSpan="4" className="p-4 text-center text-gray-500">Geen locaties gevonden in database.</td></tr>
                  ) : (
                    stores.map((s) => (
                      <tr key={s.id}>
                        <td className="p-3 font-bold">{s.store_name}</td>
                        <td className="p-3 text-gray-600">{s.address || '—'}</td>
                        <td className="p-3 text-gray-600">{s.receipt_header || '—'}</td>
                        <td className="p-3 text-right space-x-2">
                          <button
                            onClick={() => setEditingStore(s)}
                            className="bg-gray-100 hover:bg-gray-200 text-black font-bold px-3 py-1 rounded text-xs"
                          >
                            ✏️ Bewerken
                          </button>
                          <button
                            onClick={() => handleDeleteStore(s.id)}
                            className="bg-red-100 hover:bg-red-200 text-red-700 font-bold px-3 py-1 rounded text-xs"
                          >
                            🗑️ Verwijderen
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: PERSONEEL BEHEREN */}
        {activeTab === 'users' && (
          <div className="bg-white p-6 rounded-lg shadow space-y-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-bold">👥 Personeel & Gebruikersbeheer</h2>
              <button
                onClick={() => setShowAddUserModal(true)}
                className="bg-black hover:bg-gray-800 text-white font-bold px-4 py-2 rounded text-xs transition"
              >
                + Medewerker Toevoegen
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs divide-y">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="p-3">Gebruikersnaam</th>
                    <th className="p-3">Rol</th>
                    <th className="p-3">Toegewezen Locatie</th>
                    <th className="p-3 text-right">Acties</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {usersList.map((u) => {
                    const assignedStore = stores.find(s => s.id === u.store_id);
                    const isProtectedUser = u.username === 'bendemen' || u.email === 'info@bendemen.nl';

                    return (
                      <tr key={u.id}>
                        <td className="p-3 font-bold flex items-center space-x-1">
                          <span>{u.username}</span>
                          {isProtectedUser && <span className="text-xs text-red-600">👑</span>}
                        </td>
                        <td className="p-3 uppercase text-gray-500 font-semibold">{u.role}</td>
                        <td className="p-3 font-semibold text-red-600">
                          {assignedStore ? `📍 ${assignedStore.store_name}` : 'Alle Locaties'}
                        </td>
                        <td className="p-3 text-right">
                          {isProtectedUser ? (
                            <span className="bg-gray-100 text-gray-500 font-bold px-3 py-1 rounded text-xs cursor-not-allowed">
                              🔒 Systeem Account
                            </span>
                          ) : (
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              className="bg-red-100 hover:bg-red-200 text-red-700 font-bold px-3 py-1 rounded text-xs"
                            >
                              🗑️ Verwijderen
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: SUMUP PER LOCATIE */}
        {activeTab === 'sumup' && (
          <div className="bg-white p-6 rounded-lg shadow max-w-lg space-y-4">
            <h2 className="text-lg font-bold">💳 SumUp Terminal Koppelen per Locatie</h2>
            <p className="text-xs text-gray-600">Koppel een specifieke SumUp Solo kaartlezer aan een gekozen vestiging.</p>
            
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Selecteer Locatie</label>
              <select
                value={selectedStoreForSumup}
                onChange={(e) => setSelectedStoreForSumup(e.target.value)}
                className="w-full p-2 border rounded text-sm font-bold"
              >
                {stores.map(s => (
                  <option key={s.id} value={s.id}>{s.store_name} ({s.address || 'Geen adres'})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">SumUp Pairing Code</label>
              <input
                type="text"
                placeholder="Voer koppelcode in"
                value={pairingCode}
                onChange={(e) => setPairingCode(e.target.value)}
                className="w-full p-2 border-2 border-black rounded text-base font-mono font-bold"
              />
            </div>

            <button
              onClick={handlePairSumup}
              disabled={isPairingSumup}
              className="w-full bg-black text-white font-bold py-2 rounded text-sm hover:bg-gray-800 transition"
            >
              {isPairingSumup ? 'Koppelen...' : '🔗 Koppel Terminal aan Locatie'}
            </button>
          </div>
        )}

        {/* TAB 4 & 5: LIVE ORDERS & VOORRAAD */}
        {activeTab === 'orders' && (
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">📊 Live WooCommerce Bestellingen ({orders.length})</h2>
              <button onClick={() => mutateOrders()} className="bg-gray-100 hover:bg-gray-200 text-xs font-bold px-3 py-1 rounded">🔄 Verversen</button>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs divide-y">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="p-2">Order ID</th>
                    <th className="p-2">Datum</th>
                    <th className="p-2">Betaalmethode</th>
                    <th className="p-2">Status</th>
                    <th className="p-2 text-right">Totaal</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="p-2 font-bold">#{o.id}</td>
                      <td className="p-2 text-gray-500">{new Date(o.date_created).toLocaleString('nl-NL')}</td>
                      <td className="p-2">{o.payment_method_title || o.payment_method}</td>
                      <td className="p-2"><span className="bg-green-100 text-green-800 px-2 py-0.5 rounded font-bold">{o.status}</span></td>
                      <td className="p-2 text-right font-bold text-red-600">€{parseFloat(o.total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'products' && (
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">📦 Producten & Voorraad ({products.length})</h2>
              <button onClick={() => mutateProducts()} className="bg-gray-100 hover:bg-gray-200 text-xs font-bold px-3 py-1 rounded">🔄 Verversen</button>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs divide-y">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="p-2">ID</th>
                    <th className="p-2">Naam</th>
                    <th className="p-2">Prijs</th>
                    <th className="p-2">Voorraad</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td className="p-2 text-gray-400">#{p.id}</td>
                      <td className="p-2 font-semibold">{p.name}</td>
                      <td className="p-2 text-red-600 font-bold">€{p.price}</td>
                      <td className="p-2">{p.stock_quantity !== null ? p.stock_quantity : 'N.v.t.'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* POP-UP MODAL: LOCATIE AANMAKEN / BEWERKEN */}
      {(showAddStoreModal || editingStore) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">{editingStore ? 'Locatie Bewerken' : 'Nieuwe Locatie Toevoegen'}</h3>
            <form onSubmit={handleSaveStore} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Locatienaam / Winkelnaam</label>
                <input
                  type="text"
                  value={editingStore ? editingStore.store_name : newStoreData.store_name}
                  onChange={(e) => editingStore ? setEditingStore({ ...editingStore, store_name: e.target.value }) : setNewStoreData({ ...newStoreData, store_name: e.target.value })}
                  placeholder="Bijv. Ons Winkeltje"
                  className="w-full p-2 border rounded text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Adres</label>
                <input
                  type="text"
                  value={editingStore ? editingStore.address : newStoreData.address}
                  onChange={(e) => editingStore ? setEditingStore({ ...editingStore, address: e.target.value }) : setNewStoreData({ ...newStoreData, address: e.target.value })}
                  placeholder="Bijv. Centrum Hellevoetsluis"
                  className="w-full p-2 border rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Kassabon Header</label>
                <input
                  type="text"
                  value={editingStore ? editingStore.receipt_header : newStoreData.receipt_header}
                  onChange={(e) => editingStore ? setEditingStore({ ...editingStore, receipt_header: e.target.value }) : setNewStoreData({ ...newStoreData, receipt_header: e.target.value })}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Kassabon Footer</label>
                <input
                  type="text"
                  value={editingStore ? editingStore.receipt_footer : newStoreData.receipt_footer}
                  onChange={(e) => editingStore ? setEditingStore({ ...editingStore, receipt_footer: e.target.value }) : setNewStoreData({ ...newStoreData, receipt_footer: e.target.value })}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button type="button" onClick={() => { setEditingStore(null); setShowAddStoreModal(false); }} className="w-1/2 bg-gray-200 p-2 rounded text-xs font-bold">Annuleren</button>
                <button type="submit" className="w-1/2 bg-red-600 text-white p-2 rounded text-xs font-bold">Opslaan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POP-UP MODAL: MEDEWERKER TOEVOEGEN */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">Nieuwe Medewerker Toevoegen</h3>
            <form onSubmit={handleAddUser} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Gebruikersnaam</label>
                <input
                  type="text"
                  value={newUserData.username}
                  onChange={(e) => setNewUserData({ ...newUserData, username: e.target.value })}
                  className="w-full p-2 border rounded text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Wachtwoord</label>
                <input
                  type="password"
                  value={newUserData.password}
                  onChange={(e) => setNewUserData({ ...newUserData, password: e.target.value })}
                  className="w-full p-2 border rounded text-sm"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Rol</label>
                <select
                  value={newUserData.role}
                  onChange={(e) => setNewUserData({ ...newUserData, role: e.target.value })}
                  className="w-full p-2 border rounded text-sm"
                >
                  <option value="cashier">Caissière (Kassa Only)</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Winkellocatie Toewijzen</label>
                <select
                  value={newUserData.store_id}
                  onChange={(e) => setNewUserData({ ...newUserData, store_id: e.target.value })}
                  className="w-full p-2 border rounded text-sm font-semibold"
                >
                  <option value="">Alle Locaties (Geen Beperking)</option>
                  {stores.map(s => (
                    <option key={s.id} value={s.id}>📍 {s.store_name}</option>
                  ))}
                </select>
              </div>

              <div className="flex space-x-2 pt-2">
                <button type="button" onClick={() => setShowAddUserModal(false)} className="w-1/2 bg-gray-200 p-2 rounded text-xs font-bold">Annuleren</button>
                <button type="submit" className="w-1/2 bg-black text-white p-2 rounded text-xs font-bold">Toevoegen</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}