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
  const [newStore, setNewStore] = useState({ store_name: '', address: '', receipt_header: '', receipt_footer: '', pickup_id: '', terminal_id: '' });

  // Bewerk states (Modalen)
  const [editingUser, setEditingUser] = useState(null);
  const [editingStore, setEditingStore] = useState(null);
  const [editingSumUp, setEditingSumUp] = useState(null);

  // Paginering Orders
  const [currentPage, setCurrentPage] = useState(1);
  const ordersPerPage = 10;

  // HELPER: Format Attribute Text (Geen undefined meer)
  const formatAttributes = (attributes) => {
    if (!attributes || !Array.isArray(attributes) || attributes.length === 0) return '';
    return attributes
      .map((a) => {
        const key = a.name || a.slug || 'Optie';
        const val = a.option || 'Standaard';
        return `${key}: ${val}`;
      })
      .join(' | ');
  };

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
      if (data.success) {
        const rawProducts = data.products || [];
        setProducts(rawProducts);

        rawProducts.forEach(async (prod) => {
          if (prod.type === 'variable' && (!prod.variations_data || prod.variations_data.length === 0) && (!prod.variations || prod.variations.length === 0)) {
            try {
              const varRes = await fetch(`/api/woocommerce/variations?productId=${prod.id}`);
              const varData = await varRes.json();
              if (varData.success && varData.variations) {
                setProducts(prev => prev.map(p => p.id === prod.id ? { ...p, variations: varData.variations } : p));
              }
            } catch (e) {
              console.error(`Fout bij laden variaties voor product ${prod.id}`, e);
            }
          }
        });
      }
    } catch (err) {
      console.error('Fout bij ophalen producten:', err);
    }
  };

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/woocommerce/orders');
      const data = await res.json();
      if (data.success) setOrders(data.orders || []);
    } catch (err) {
      console.error('Fout bij ophalen bestellingen:', err);
    }
  };

  const handleUpdateOrderStatus = async (id, newStatus) => {
    try {
      const res = await fetch('/api/woocommerce/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        alert('Status bijgewerkt!');
        fetchOrders();
      } else {
        alert('Fout bij updaten status: ' + (data.error || 'Onbekende fout'));
      }
    } catch (err) {
      alert('Fout bij updaten status.');
    }
  };

  // --- GEBRUIKER ACTIES ---
  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const storeIdNum = newUser.store_id && newUser.store_id !== '' && newUser.store_id !== 'null' ? Number(newUser.store_id) : null;
      const payload = {
        ...newUser,
        store_id: storeIdNum !== null && !isNaN(storeIdNum) ? storeIdNum : null
      };
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    if (editingUser.username.toLowerCase() === 'bendemen') {
      alert('Het hoofdaccount bendemen kan niet worden bewerkt.');
      setEditingUser(null);
      return;
    }
    try {
      const rawStoreId = editingUser.store_id;
      const storeIdNum = rawStoreId !== '' && rawStoreId !== null && rawStoreId !== 'null' && rawStoreId !== undefined ? Number(rawStoreId) : null;
      
      const payload = {
        ...editingUser,
        store_id: storeIdNum !== null && !isNaN(storeIdNum) ? storeIdNum : null
      };
      
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        alert('Medewerker succesvol bijgewerkt!');
        setEditingUser(null);
        fetchUsers();
      } else {
        alert('Fout: ' + (data.error || data.message));
      }
    } catch (err) {
      console.error('Fout bij bijwerken gebruiker:', err);
      alert('Fout bij bijwerken medewerker.');
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

  // --- WINKEL ACTIES ---
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
        setNewStore({ store_name: '', address: '', receipt_header: '', receipt_footer: '', pickup_id: '', terminal_id: '' });
        fetchStores();
      } else {
        alert('Fout: ' + data.error);
      }
    } catch (err) {
      alert('Fout bij toevoegen filiaal.');
    }
  };

  const handleUpdateStore = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/store', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingStore)
      });
      const data = await res.json();
      if (data.success) {
        alert('Filiaal succesvol bijgewerkt!');
        setEditingStore(null);
        fetchStores();
      } else {
        alert('Fout: ' + data.error);
      }
    } catch (err) {
      alert('Fout bij bijwerken filiaal.');
    }
  };

  const handleUpdateSumUp = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/store', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingSumUp)
      });
      const data = await res.json();
      if (data.success) {
        alert('SumUp Reader succesvol gekoppeld/bijgewerkt!');
        setEditingSumUp(null);
        fetchStores();
      } else {
        alert('Fout: ' + data.error);
      }
    } catch (err) {
      alert('Fout bij bijwerken SumUp lezer.');
    }
  };

  // --- PAGINERING LOGICA ---
  const indexOfLastOrder = currentPage * ordersPerPage;
  const indexOfFirstOrder = indexOfLastOrder - ordersPerPage;
  const currentOrders = orders.slice(indexOfFirstOrder, indexOfLastOrder);
  const totalPages = Math.ceil(orders.length / ordersPerPage);

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
      <div className="bg-white border-b px-6 py-2 flex space-x-4 shadow-sm overflow-x-auto">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded text-xs font-bold transition whitespace-nowrap ${activeTab === 'users' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          👥 Medewerkers & Toegang
        </button>
        <button
          onClick={() => setActiveTab('stores')}
          className={`px-4 py-2 rounded text-xs font-bold transition whitespace-nowrap ${activeTab === 'stores' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          📍 Filialen Beheren
        </button>
        <button
          onClick={() => setActiveTab('sumup')}
          className={`px-4 py-2 rounded text-xs font-bold transition whitespace-nowrap ${activeTab === 'sumup' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          💳 SumUp per Locatie
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2 rounded text-xs font-bold transition whitespace-nowrap ${activeTab === 'orders' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          📦 Bestellingen Live
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-4 py-2 rounded text-xs font-bold transition whitespace-nowrap ${activeTab === 'inventory' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          📦 Voorraad & Variaties
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
                      value={newUser.store_id || ''}
                      onChange={(e) => setNewUser({...newUser, store_id: e.target.value})}
                      className="p-2 border rounded text-xs"
                    >
                      <option value="">Kies Filiaal (Optioneel)</option>
                      {stores.map(s => {
                        const sId = s.id || s.store_id;
                        return (
                          <option key={sId} value={String(sId)}>{s.store_name || s.name || `Filiaal #${sId}`}</option>
                        );
                      })}
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
                          <th className="p-3">Gekoppeld Filiaal</th>
                          <th className="p-3 text-right">Acties</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {users.map(u => {
                          const matchedStore = stores.find(s => String(s.id || s.store_id) === String(u.store_id));
                          const isBendemen = u.username.toLowerCase() === 'bendemen';

                          return (
                            <tr key={u.id} className="hover:bg-gray-50">
                              <td className="p-3">#{u.id}</td>
                              <td className="p-3 font-bold">{u.username}</td>
                              <td className="p-3"><span className="bg-gray-200 px-2 py-0.5 rounded uppercase font-semibold text-[10px]">{u.role}</span></td>
                              <td className="p-3">
                                {matchedStore ? (matchedStore.store_name || matchedStore.name) : (u.store_id ? `ID: ${u.store_id}` : 'Geen')}
                              </td>
                              <td className="p-3 text-right space-x-2">
                                {isBendemen ? (
                                  <span className="text-gray-400 font-semibold italic text-[11px]">Beveiligd</span>
                                ) : (
                                  <>
                                    <button onClick={() => setEditingUser(u)} className="text-blue-600 font-bold hover:underline">
                                      Bewerken
                                    </button>
                                    <button onClick={() => handleDeleteUser(u.id, u.username)} className="text-red-600 font-bold hover:underline">
                                      Verwijderen
                                    </button>
                                  </>
                                )}
                              </td>
                            </tr>
                          );
                        })}
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
                  <form onSubmit={handleCreateStore} className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                    <input
                      type="text"
                      placeholder="SumUp Terminal ID / Pair Code (Optioneel, kan later)"
                      value={newStore.terminal_id}
                      onChange={(e) => setNewStore({...newStore, terminal_id: e.target.value})}
                      className="p-2 border rounded text-xs"
                    />
                    <button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-bold p-2 rounded text-xs uppercase md:col-span-2">
                      Filiaal Aanmaken
                    </button>
                  </form>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-md font-bold mb-4">Actieve Filialen ({stores.length})</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {stores.map(s => (
                      <div key={s.id || s.store_id} className="border p-4 rounded-lg bg-gray-50 flex flex-col justify-between">
                        <div>
                          <div className="font-bold text-sm text-red-600">{s.store_name || s.name}</div>
                          <div className="text-xs text-gray-500 mt-1">📍 {s.address || 'Geen adres'}</div>
                          <div className="text-xs text-gray-400 mt-0.5">ID: #{s.id || s.store_id} | Terminal: {s.terminal_id || 'Niet gekoppeld'}</div>
                        </div>
                        <div className="mt-3 text-right">
                          <button onClick={() => setEditingStore(s)} className="text-xs bg-black text-white px-3 py-1 rounded font-bold hover:bg-gray-800">
                            Bewerken
                          </button>
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
                <h3 className="text-md font-bold mb-2">💳 SumUp Terminal Koppelingen per Locatie</h3>
                <p className="text-xs text-gray-500 mb-4">Beheer hier per filiaal de gekoppelde SumUp Terminal ID / Pair Code. Je kunt op elk moment een reader koppelen of wijzigen.</p>
                <div className="space-y-3">
                  {stores.length === 0 ? (
                    <div className="text-xs text-gray-400 p-4 border rounded bg-gray-50 text-center">Geen filialen gevonden. Maak eerst een filiaal aan via 'Filialen Beheren'.</div>
                  ) : (
                    stores.map(s => (
                      <div key={s.id || s.store_id} className="border p-3 rounded flex justify-between items-center bg-gray-50">
                        <div>
                          <span className="font-bold text-sm">{s.store_name || s.name}</span>
                          <div className="text-xs text-gray-600 mt-0.5">
                            Terminal ID / Code: <span className="font-mono font-bold text-black">{s.terminal_id ? s.terminal_id : 'Nog niet gekoppeld'}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`text-xs px-2 py-1 rounded font-bold ${s.terminal_id ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {s.terminal_id ? 'Gekoppeld' : 'Geen Reader'}
                          </span>
                          <button onClick={() => setEditingSumUp(s)} className="text-xs bg-black text-white px-3 py-1 rounded font-bold hover:bg-gray-800">
                            {s.terminal_id ? 'Wijzigen' : 'Koppelen'}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* 4. ORDERS TAB */}
            {activeTab === 'orders' && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-md font-bold mb-4">📦 Live Webshop Bestellingen ({orders.length})</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs divide-y mb-4">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="p-3">Order # (Volgnummer)</th>
                        <th className="p-3">Klant</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Totaal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {currentOrders.length === 0 ? (
                        <tr><td colSpan="4" className="p-6 text-center text-gray-400">Geen bestellingen gevonden.</td></tr>
                      ) : (
                        currentOrders.map(o => (
                          <tr key={o.id} className="hover:bg-gray-50">
                            <td className="p-3 font-bold">#{o.number || o.id}</td>
                            <td className="p-3">{o.billing?.first_name} {o.billing?.last_name}</td>
                            <td className="p-3">
                              <select 
                                value={o.status} 
                                onChange={(e) => handleUpdateOrderStatus(o.id, e.target.value)}
                                className="border rounded p-1 text-xs font-bold bg-white"
                              >
                                <option value="pending">Pending</option>
                                <option value="processing">Processing</option>
                                <option value="on-hold">On Hold</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                                <option value="refunded">Refunded</option>
                                <option value="failed">Failed</option>
                              </select>
                            </td>
                            <td className="p-3 font-bold text-red-600">€{parseFloat(o.total || 0).toFixed(2)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>

                  {totalPages > 1 && (
                    <div className="flex justify-center space-x-1 pt-2">
                      {[...Array(totalPages).keys()].map(num => (
                        <button
                          key={num}
                          onClick={() => setCurrentPage(num + 1)}
                          className={`px-3 py-1 text-xs font-bold border rounded ${currentPage === num + 1 ? 'bg-black text-white' : 'bg-white text-black hover:bg-gray-100'}`}
                        >
                          {num + 1}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 5. INVENTORY TAB */}
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
                      {products.map(product => {
                        const productVariations = product.variations_data || product.variations || [];
                        return (
                          <>
                            <tr key={product.id} className="hover:bg-gray-50 font-semibold">
                              <td className="p-3">#{product.id}</td>
                              <td className="p-3">
                                {product.name} 
                                {product.type === 'variable' && (
                                  <span className="text-[10px] bg-black text-white px-1.5 py-0.5 rounded ml-2 uppercase">Variabel</span>
                                )}
                              </td>
                              <td className="p-3 text-red-600">
                                {product.price ? `€${parseFloat(product.price).toFixed(2)}` : 'Vanaf prijs'}
                              </td>
                              <td className="p-3">
                                {product.stock_quantity !== null && product.stock_quantity !== undefined 
                                  ? <span className={`px-2 py-0.5 rounded text-white font-bold ${product.stock_quantity <= 0 ? 'bg-red-600' : 'bg-green-600'}`}>{product.stock_quantity}</span>
                                  : 'N.v.t.'}
                              </td>
                            </tr>
                            
                            {product.type === 'variable' && productVariations.map(v => {
                              const attrText = formatAttributes(v.attributes) || `Variatie #${v.id}`;

                              return (
                                <tr key={`var_${v.id}`} className="bg-gray-50 text-gray-600">
                                  <td className="p-3 pl-6 font-mono text-[11px]">↳ #{v.id}</td>
                                  <td className="p-3 italic">
                                    &nbsp;&nbsp;└ {attrText}
                                  </td>
                                  <td className="p-3">€{parseFloat(v.price || product.price || 0).toFixed(2)}</td>
                                  <td className="p-3">
                                    {v.stock_quantity !== null && v.stock_quantity !== undefined 
                                      ? <span className={`px-2 py-0.5 rounded text-white font-bold text-[10px] ${v.stock_quantity <= 0 ? 'bg-red-500' : 'bg-green-500'}`}>{v.stock_quantity}</span>
                                      : 'N.v.t.'}
                                  </td>
                                </tr>
                              );
                            })}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* MODAL: GEBRUIKER BEWERKEN */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleUpdateUser} className="bg-white rounded-lg p-6 max-w-sm w-full space-y-3 shadow-2xl">
            <h3 className="text-md font-bold mb-2">Medewerker Bewerken: {editingUser.username}</h3>
            
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Gebruikersnaam</label>
              <input 
                type="text" 
                value={editingUser.username} 
                onChange={(e) => setEditingUser({...editingUser, username: e.target.value})}
                className="w-full p-2 border rounded text-xs"
                required
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Nieuw Wachtwoord (leeg laten om niet te wijzigen)</label>
              <input 
                type="password" 
                placeholder="Nieuw wachtwoord"
                value={editingUser.password || ''}
                onChange={(e) => setEditingUser({...editingUser, password: e.target.value})}
                className="w-full p-2 border rounded text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Rol</label>
              <select
                value={editingUser.role}
                onChange={(e) => setEditingUser({...editingUser, role: e.target.value})}
                className="w-full p-2 border rounded text-xs"
              >
                <option value="cashier">Cashier</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Koppel Filiaal</label>
              <select
                value={editingUser.store_id !== null && editingUser.store_id !== undefined && editingUser.store_id !== 'null' ? String(editingUser.store_id) : ''}
                onChange={(e) => setEditingUser({...editingUser, store_id: e.target.value})}
                className="w-full p-2 border rounded text-xs"
              >
                <option value="">Geen Filiaal</option>
                {stores.map(s => {
                  const sId = s.id || s.store_id;
                  return (
                    <option key={sId} value={String(sId)}>{s.store_name || s.name || `Filiaal #${sId}`}</option>
                  );
                })}
              </select>
            </div>

            <div className="flex space-x-2 pt-2">
              <button type="button" onClick={() => setEditingUser(null)} className="w-1/2 bg-gray-200 p-2 rounded text-xs font-bold">Annuleren</button>
              <button type="submit" className="w-1/2 bg-red-600 text-white p-2 rounded text-xs font-bold">Opslaan</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: WINKEL BEWERKEN */}
      {editingStore && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleUpdateStore} className="bg-white rounded-lg p-6 max-w-sm w-full space-y-3 shadow-2xl">
            <h3 className="text-md font-bold mb-2">Filiaal Bewerken</h3>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Naam Filiaal</label>
              <input
                type="text"
                value={editingStore.store_name || editingStore.name || ''}
                onChange={(e) => setEditingStore({...editingStore, store_name: e.target.value, name: e.target.value})}
                className="w-full p-2 border rounded text-xs"
                required
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Adres</label>
              <input
                type="text"
                value={editingStore.address || ''}
                onChange={(e) => setEditingStore({...editingStore, address: e.target.value})}
                className="w-full p-2 border rounded text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Local Pickup Plus ID</label>
              <input
                type="text"
                value={editingStore.pickup_id || ''}
                onChange={(e) => setEditingStore({...editingStore, pickup_id: e.target.value})}
                className="w-full p-2 border rounded text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Terminal ID / Pair Code</label>
              <input
                type="text"
                value={editingStore.terminal_id || ''}
                onChange={(e) => setEditingStore({...editingStore, terminal_id: e.target.value})}
                className="w-full p-2 border rounded text-xs font-bold"
              />
            </div>
            <div className="flex space-x-2 pt-2">
              <button type="button" onClick={() => setEditingStore(null)} className="w-1/2 bg-gray-200 p-2 rounded text-xs font-bold">Annuleren</button>
              <button type="submit" className="w-1/2 bg-red-600 text-white p-2 rounded text-xs font-bold">Opslaan</button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: SUMUP READER KOPPELEN / BEWERKEN */}
      {editingSumUp && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleUpdateSumUp} className="bg-white rounded-lg p-6 max-w-sm w-full space-y-3 shadow-2xl">
            <h3 className="text-md font-bold mb-2">SumUp Reader Koppelen: {editingSumUp.store_name || editingSumUp.name}</h3>
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Terminal ID / Pair Code</label>
              <input
                type="text"
                placeholder="Voer SumUp Pair Code in"
                value={editingSumUp.terminal_id || ''}
                onChange={(e) => setEditingSumUp({...editingSumUp, terminal_id: e.target.value})}
                className="w-full p-2 border rounded text-xs font-bold"
              />
              <p className="text-[10px] text-gray-400 mt-1">Laat dit leeg als je de reader wilt ontkoppelen.</p>
            </div>
            <div className="flex space-x-2 pt-2">
              <button type="button" onClick={() => setEditingSumUp(null)} className="w-1/2 bg-gray-200 p-2 rounded text-xs font-bold">Annuleren</button>
              <button type="submit" className="w-1/2 bg-red-600 text-white p-2 rounded text-xs font-bold">Opslaan</button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}