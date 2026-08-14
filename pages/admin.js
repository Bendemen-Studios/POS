import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function AdminDashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('users'); // 'users', 'stores', 'sumup', 'orders', 'inventory'

  // Data states
  const [users, setUsers] = useState([]);
  const [stores, setStores] = useState([]);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);

  // Form states voor nieuwe gebruiker
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'cashier', store_id: '', email: '' });
  
  // Form states voor nieuwe winkel
  const [newStore, setNewStore] = useState({ store_name: '', address: '', receipt_header: '', receipt_footer: '', pickup_id: '' });

  useEffect(() => {
    const userStr = localStorage.getItem('pos_user');
    if (!userStr) {
      router.push('/login');
      return;
    }
    try {
      const parsed = JSON.parse(userStr);
      if (parsed.role !== 'admin' && parsed.role !== 'super_admin') {
        alert('Geen toegang tot het admin-gedeelte.');
        router.push('/');
        return;
      }
      setCurrentUser(parsed);
    } catch (e) {
      router.push('/login');
      return;
    }

    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    await Promise.all([
      fetchUsers(),
      fetchStores(),
      fetchProducts(),
      fetchOrders()
    ]);
    setLoading(false);
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (data.success) setUsers(data.users || []);
    } catch (err) {
      console.error('Fout bij ophalen gebruikers:', err);
    }
  };

  const fetchStores = async () => {
    try {
      const res = await fetch('/api/admin/store');
      const data = await res.json();
      if (data.success) {
        setStores(Array.isArray(data.stores) ? data.stores : (data.store ? [data.store] : []));
      }
    } catch (err) {
      console.error('Fout bij ophalen winkels:', err);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/woocommerce/products');
      const data = await res.json();
      if (data.success) setProducts(data.products || []);
    } catch (err) {
      console.error('Fout bij ophalen producten:', err);
    }
  };

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/woocommerce/pickup-orders');
      const data = await res.json();
      if (data.success) setOrders(data.orders || []);
    } catch (err) {
      console.error('Fout bij ophalen bestellingen:', err);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser)
      });
      const data = await res.json();
      if (data.success) {
        alert('Medewerker succesvol aangemaakt!');
        setNewUser({ username: '', password: '', role: 'cashier', store_id: '', email: '' });
        fetchUsers();
      } else {
        alert('Fout: ' + (data.error || data.message));
      }
    } catch (err) {
      alert('Fout bij aanmaken medewerker.');
    }
  };

  const handleDeleteUser = async (id, username) => {
    if (username.toLowerCase() === 'bendemen') {
      alert('Het hoofdaccount bendemen kan niet worden verwijderd.');
      return;
    }
    if (!confirm(`Weet je zeker dat je gebruiker #${id} (${username}) wilt verwijderen?`)) return;

    try {
      const res = await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchUsers();
      } else {
        alert('Fout: ' + data.error);
      }
    } catch (err) {
      alert('Fout bij verwijderen gebruiker.');
    }
  };

  const handleCreateStore = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStore)
      });
      const data = await res.json();
      if (data.success) {
        alert('Filiaal succesvol toegevoegd!');
        setNewStore({ store_name: '', address: '', receipt_header: '', receipt_footer: '', pickup_id: '' });
        fetchStores();
      } else {
        alert('Fout: ' + data.error);
      }
    } catch (err) {
      alert('Fout bij toevoegen filiaal.');
    }
  };

  if (!currentUser) return <div className="p-8 text-center font-bold">Laden...</div>;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-black text-white p-4 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-3">
          <span className="font-bold text-xl tracking-wider">BDM POS // Admin Dashboard</span>
        </div>
        <div className="flex items-center space-x-2">
          <Link href="/">
            <button className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded text-xs font-semibold transition">
              🛒 Terug naar Kassa
            </button>
          </Link>
        </div>
      </header>

      {/* Nav Tabs */}
      <div className="bg-white border-b px-6 py-2 flex space-x-4 shadow-sm">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded text-xs font-bold transition ${activeTab === 'users' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          👥 Medewerkers & Toegang
        </button>
        <button
          onClick={() => setActiveTab('stores')}
          className={`px-4 py-2 rounded text-xs font-bold transition ${activeTab === 'stores' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          📍 Filialen Beheren
        </button>
        <button
          onClick={() => setActiveTab('sumup')}
          className={`px-4 py-2 rounded text-xs font-bold transition ${activeTab === 'sumup' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          💳 SumUp per Locatie
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 rounded text-xs font-bold transition ${activeTab === 'orders' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          📦 Bestellingen Live
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-4 py-2 rounded text-xs font-bold transition ${activeTab === 'inventory' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          📦 Voorraad
        </button>
      </div>

      {/* Main Content Container */}
      <div className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {loading ? (
          <div className="text-center py-12 font-bold text-gray-500">Gegevens laden...</div>
        ) : (
          <>
            {/* 1. USERS TAB */}
            {activeTab === 'users' && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-md font-bold mb-4">Nieuwe Medewerker Aanmaken</h3>
                  <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-5 gap-3">
                    <input
                      type="text"
                      placeholder="Gebruikersnaam"
                      value={newUser.username}
                      onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                      className="p-2 border rounded text-xs"
                      required
                    />
                    <input
                      type="password"
                      placeholder="Wachtwoord"
                      value={newUser.password}
                      onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                      className="p-2 border rounded text-xs"
                      required
                    />
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                      className="p-2 border rounded text-xs"
                    >
                      <option value="cashier">Cashier</option>
                      <option value="admin">Admin</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                    <select
                      value={newUser.store_id}
                      onChange={(e) => setNewUser({...newUser, store_id: e.target.value})}
                      className="p-2 border rounded text-xs"
                    >
                      <option value="">Kies Filiaal (Optioneel)</option>
                      {stores.map(s => (
                        <option key={s.id} value={s.id}>{s.store_name || s.name}</option>
                      ))}
                    </select>
                    <button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-bold p-2 rounded text-xs uppercase">
                      Aanmaken
                    </button>
                  </form>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-md font-bold mb-4">Bestaande Medewerkers ({users.length})</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs divide-y">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="p-3">ID</th>
                          <th className="p-3">Gebruikersnaam</th>
                          <th className="p-3">Rol</th>
                          <th className="p-3">Filiaal ID</th>
                          <th className="p-3 text-right">Actie</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {users.map(u => (
                          <tr key={u.id} className="hover:bg-gray-50">
                            <td className="p-3">#{u.id}</td>
                            <td className="p-3 font-bold">{u.username}</td>
                            <td className="p-3"><span className="bg-gray-200 px-2 py-0.5 rounded uppercase font-semibold text-[10px]">{u.role}</span></td>
                            <td className="p-3">{u.store_id || 'Geen'}</td>
                            <td className="p-3 text-right">
                              {u.username.toLowerCase() !== 'bendemen' && (
                                <button onClick={() => handleDeleteUser(u.id, u.username)} className="text-red-600 font-bold hover:underline">
                                  Verwijderen
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 2. STORES TAB */}
            {activeTab === 'stores' && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-md font-bold mb-4">Nieuw Filiaal Toevoegen</h3>
                  <form onSubmit={handleCreateStore} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input
                      type="text"
                      placeholder="Naam Filiaal (bijv. Ons Winkeltje)"
                      value={newStore.store_name}
                      onChange={(e) => setNewStore({...newStore, store_name: e.target.value})}
                      className="p-2 border rounded text-xs"
                      required
                    />
                    <input
                      type="text"
                      placeholder="Adres"
                      value={newStore.address}
                      onChange={(e) => setNewStore({...newStore, address: e.target.value})}
                      className="p-2 border rounded text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Local Pickup Plus ID (optioneel)"
                      value={newStore.pickup_id}
                      onChange={(e) => setNewStore({...newStore, pickup_id: e.target.value})}
                      className="p-2 border rounded text-xs"
                    />
                    <button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-bold p-2 rounded text-xs uppercase md:col-span-3">
                      Filiaal Opslaan
                    </button>
                  </form>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-md font-bold mb-4">Actieve Filialen ({stores.length})</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {stores.map(s => (
                      <div key={s.id} className="border p-4 rounded-lg bg-gray-50 flex flex-col justify-between">
                        <div>
                          <div className="font-bold text-sm text-red-600">{s.store_name || s.name}</div>
                          <div className="text-xs text-gray-500 mt-1">📍 {s.address || 'Geen adres'}</div>
                          <div className="text-xs text-gray-400 mt-0.5">Pickup ID: {s.pickup_id || 'N.v.t.'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 3. SUMUP TAB */}
            {activeTab === 'sumup' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-md font-bold mb-2">💳 SumUp Terminal Koppelingen</h3>
                <p className="text-xs text-gray-500 mb-4">Beheer hier welke SumUp Solo lezer is gekoppeld aan welke fysieke locatie.</p>
                <div className="space-y-3">
                  {stores.map(s => (
                    <div key={s.id} className="border p-3 rounded flex justify-between items-center bg-gray-50">
                      <div>
                        <span className="font-bold text-sm">{s.store_name || s.name}</span>
                        <div className="text-xs text-gray-400">Terminal ID: {s.terminal_id || 'SOLO_READER_1'}</div>
                      </div>
                      <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded font-bold">Actief</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. ORDERS TAB */}
            {activeTab === 'orders' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-md font-bold mb-4">📦 Live Webshop Bestellingen ({orders.length})</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs divide-y">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="p-3">Order ID</th>
                        <th className="p-3">Klant</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Totaal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {orders.map(o => (
                        <tr key={o.id} className="hover:bg-gray-50">
                          <td className="p-3 font-bold">#{o.number || o.id}</td>
                          <td className="p-3">{o.billing?.first_name} {o.billing?.last_name}</td>
                          <td className="p-3"><span className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded font-bold">{o.status}</span></td>
                          <td className="p-3 font-bold text-red-600">€{parseFloat(o.total || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 5. INVENTORY / VOORRAAD TAB (Inclusief Variaties) */}
            {activeTab === 'inventory' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-md font-bold mb-4">📦 Producten & Voorraad (Inclusief Variaties) ({products.length})</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs divide-y">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="p-3">ID</th>
                        <th className="p-3">Naam</th>
                        <th className="p-3">Prijs</th>
                        <th className="p-3">Voorraad</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {products.map(product => (
                        <>
                          <tr key={product.id} className="hover:bg-gray-50 font-semibold">
                            <td className="p-3">#{product.id}</td>
                            <td className="p-3">
                              {product.name} 
                              {product.type === 'variable' && (
                                <span className="text-[10px] bg-black text-white px-1.5 py-0.5 rounded ml-2 uppercase">Variabel</span>
                              )}
                            </td>
                            <td className="p-3 text-red-600">€{parseFloat(product.price || 0).toFixed(2)}</td>
                            <td className="p-3">
                              {product.stock_quantity !== null && product.stock_quantity !== undefined 
                                ? <span className={`px-2 py-0.5 rounded text-white font-bold ${product.stock_quantity <= 0 ? 'bg-red-600' : 'bg-green-600'}`}>{product.stock_quantity}</span>
                                : 'N.v.t.'}
                            </td>
                          </tr>
                          {/* Variaties onder het hoofdproduct tonen */}
                          {product.variations && product.variations.map(v => (
                            <tr key={`var_${v.id}`} className="bg-gray-50 text-gray-600">
                              <td className="p-3 pl-6">↳ #{v.id}</td>
                              <td className="p-3 italic">
                                &nbsp;&nbsp;└ {v.attributes ? v.attributes.map(a => `${a.name}: ${a.option}`).join(', ') : 'Variatie'}
                              </td>
                              <td className="p-3">€{parseFloat(v.price || product.price || 0).toFixed(2)}</td>
                              <td className="p-3">
                                {v.stock_quantity !== null && v.stock_quantity !== undefined 
                                  ? <span className={`px-2 py-0.5 rounded text-white font-bold text-[10px] ${v.stock_quantity <= 0 ? 'bg-red-500' : 'bg-green-500'}`}>{v.stock_quantity}</span>
                                  : 'N.v.t.'}
                              </td>
                            </tr>
                          ))}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}