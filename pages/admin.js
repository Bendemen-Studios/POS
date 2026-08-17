import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import React from 'react';

export default function AdminDashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('admin_active_tab') || 'users';
    }
    return 'users';
  });

  const [users, setUsers] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('admin_cached_users');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [stores, setStores] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('admin_cached_stores');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [orders, setOrders] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('admin_cached_orders');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [loading, setLoading] = useState(false);

  const [products, setProducts] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('admin_products');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'cashier', store_id: '', email: '' });
  const [newStore, setNewStore] = useState({ store_name: '', address: '', kvk: '', btw: '', pickup_id: '' });

  const [editingUser, setEditingUser] = useState(null);
  const [editingStore, setEditingStore] = useState(null);
  const [editingSumUp, setEditingSumUp] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const ordersPerPage = 10;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('admin_active_tab', activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    if (typeof window !== 'undefined' && products.length > 0) {
      localStorage.setItem('admin_products', JSON.stringify(products));
    }
  }, [products]);

  useEffect(() => {
    if (typeof window !== 'undefined' && users.length > 0) {
      localStorage.setItem('admin_cached_users', JSON.stringify(users));
    }
  }, [users]);

  useEffect(() => {
    if (typeof window !== 'undefined' && stores.length > 0) {
      localStorage.setItem('admin_cached_stores', JSON.stringify(stores));
    }
  }, [stores]);

  useEffect(() => {
    if (typeof window !== 'undefined' && orders.length > 0) {
      localStorage.setItem('admin_cached_orders', JSON.stringify(orders));
    }
  }, [orders]);

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
      router.replace('/login');
      return;
    }
    try {
      const parsed = JSON.parse(userStr);
      if (parsed.role !== 'admin' && parsed.role !== 'super_admin') {
        alert('Geen toegang tot het admin-gedeelte.');
        router.replace('/');
        return;
      }
      setCurrentUser(parsed);
    } catch (e) {
      router.replace('/login');
      return;
    }

    fetchAllData();
  }, [router]);

  const fetchAllData = async () => {
    setLoading(true);
    await Promise.all([
      fetchUsers(),
      fetchStores(),
      fetchOrders()
    ]);
    
    const savedProducts = localStorage.getItem('admin_products');
    if (!savedProducts || JSON.parse(savedProducts).length === 0) {
      await fetchProductsSilently();
    }
    setLoading(false);
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (data.success && data.users) {
        setUsers(data.users);
        localStorage.setItem('admin_cached_users', JSON.stringify(data.users));
      }
    } catch (err) {
      console.error('Fout bij ophalen gebruikers:', err);
    }
  };

  const fetchStores = async () => {
    try {
      const res = await fetch('/api/admin/store');
      const data = await res.json();
      if (data.success) {
        const storeList = Array.isArray(data.stores) ? data.stores : (data.store ? [data.store] : []);
        setStores(storeList);
        localStorage.setItem('admin_cached_stores', JSON.stringify(storeList));
      }
    } catch (err) {
      console.error('Fout bij ophalen winkels:', err);
    }
  };

  const fetchProductsSilently = async () => {
    try {
      const res = await fetch('/api/woocommerce/products');
      const data = await res.json();
      if (data.success) {
        setProducts(data.products || []);
        localStorage.setItem('admin_products', JSON.stringify(data.products || []));
      }
    } catch (err) {
      console.error('Fout bij ophalen producten:', err);
    }
  };

  const handleManualSyncProducts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/woocommerce/products');
      const data = await res.json();
      if (data.success) {
        setProducts(data.products || []);
        localStorage.setItem('admin_products', JSON.stringify(data.products || []));
        alert('Producten succesvol gesynchroniseerd met WooCommerce!');
      } else {
        alert('Fout bij synchroniseren van producten.');
      }
    } catch (err) {
      alert('Kan geen verbinding maken met WooCommerce.');
    } finally {
      setLoading(false);
    }
  };

  const fetchOrders = async () => {
    try {
      const res = await fetch('/api/woocommerce/orders');
      const data = await res.json();
      if (data.success && data.orders) {
        setOrders(data.orders);
        localStorage.setItem('admin_cached_orders', JSON.stringify(data.orders));
      }
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
        alert('Fout bij updaten status.');
      }
    } catch (err) {
      alert('Fout bij updaten status.');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...newUser,
        store_id: newUser.store_id && newUser.store_id !== '' && newUser.store_id !== 'null' ? String(newUser.store_id) : null
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
      const storeIdStr = rawStoreId !== '' && rawStoreId !== null && rawStoreId !== 'null' && rawStoreId !== undefined ? String(rawStoreId) : null;
      
      const payload = { ...editingUser, store_id: storeIdStr };
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        alert('Medewerker bijgewerkt!');
        setEditingUser(null);
        fetchUsers();
      } else {
        alert('Fout: ' + (data.error || data.message));
      }
    } catch (err) {
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
      if (data.success) fetchUsers();
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
        alert('Filiaal toegevoegd!');
        setNewStore({ store_name: '', address: '', kvk: '', btw: '', pickup_id: '' });
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
        alert('Filiaal bijgewerkt!');
        setEditingStore(null);
        fetchStores();
      }
    } catch (err) {
      alert('Fout bij bijwerken filiaal.');
    }
  };

  const handleDeleteStore = async (storeId, storeName) => {
    if (stores.length <= 1) {
      alert('Er moet minimaal 1 actief filiaal aanwezig blijven.');
      return;
    }
    if (!confirm(`Filiaal "${storeName}" verwijderen?`)) return;

    try {
      const res = await fetch(`/api/admin/store?id=${storeId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchStores();
        fetchUsers();
      }
    } catch (err) {
      alert('Fout bij verwijderen.');
    }
  };

  const handlePairSumUp = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/sumup/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: editingSumUp.id || editingSumUp.store_id,
          pairingCode: editingSumUp.pair_code,
          readerName: editingSumUp.store_name || editingSumUp.name
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert('SumUp terminal succesvol gekoppeld en opgeslagen!');
        setEditingSumUp(null);
        fetchStores();
      } else {
        alert('Fout bij koppelen: ' + (data.error || 'Onbekende fout'));
      }
    } catch (err) {
      alert('Netwerkfout bij koppelen met SumUp.');
    }
  };

  const handleUnlinkSumUp = async (storeId) => {
    if (!confirm('Weet je zeker dat je deze SumUp terminal wilt ontkoppelen?')) return;

    try {
      const res = await fetch('/api/sumup/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        alert('SumUp terminal succesvol ontkoppeld!');
        fetchStores();
      } else {
        alert('Fout bij ontkoppelen: ' + (data.error || 'Onbekende fout'));
      }
    } catch (err) {
      alert('Netwerkfout bij ontkoppelen.');
    }
  };

  const indexOfLastOrder = currentPage * ordersPerPage;
  const indexOfFirstOrder = indexOfLastOrder - ordersPerPage;
  const currentOrders = orders.slice(indexOfFirstOrder, indexOfLastOrder);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-2">
          <h1 className="text-white font-black text-xl tracking-wider">BDM ADMIN</h1>
          <div className="text-red-600 font-bold text-xs uppercase tracking-widest animate-pulse">
            Sessie controleren...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-black text-white p-4 flex flex-col sm:flex-row justify-between items-center gap-3 shadow-md">
        <div className="flex items-center space-x-3">
          <span className="font-bold text-lg sm:text-xl tracking-wider text-center sm:text-left">BDM POS // Admin Dashboard</span>
        </div>
        <div className="flex items-center space-x-2">
          <Link href="/">
            <button className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded text-xs font-semibold transition w-full sm:w-auto">
              🛒 Terug naar Kassa
            </button>
          </Link>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b px-4 sm:px-6 py-2 flex space-x-2 sm:space-x-4 shadow-sm overflow-x-auto no-scrollbar">
        <button onClick={() => setActiveTab('users')} className={`px-3 sm:px-4 py-2 rounded text-xs font-bold transition whitespace-nowrap ${activeTab === 'users' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'}`}>👥 Medewerkers</button>
        <button onClick={() => setActiveTab('stores')} className={`px-3 sm:px-4 py-2 rounded text-xs font-bold transition whitespace-nowrap ${activeTab === 'stores' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'}`}>📍 Filialen</button>
        <button onClick={() => setActiveTab('sumup')} className={`px-3 sm:px-4 py-2 rounded text-xs font-bold transition whitespace-nowrap ${activeTab === 'sumup' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'}`}>💳 SumUp</button>
        <button onClick={() => setActiveTab('orders')} className={`px-3 sm:px-4 py-2 rounded text-xs font-bold transition whitespace-nowrap ${activeTab === 'orders' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'}`}>📦 Bestellingen</button>
        <button onClick={() => setActiveTab('inventory')} className={`px-3 sm:px-4 py-2 rounded text-xs font-bold transition whitespace-nowrap ${activeTab === 'inventory' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700'}`}>📦 Voorraad & Variaties</button>
      </div>

      <div className="flex-1 p-3 sm:p-6 max-w-7xl mx-auto w-full">
        {loading && activeTab !== 'inventory' ? (
          <div className="bg-white rounded-lg shadow p-8 sm:p-12 text-center space-y-2">
            <div className="text-red-600 font-black text-base sm:text-lg tracking-wider animate-pulse">ADMIN // GEGEVENS LADEN</div>
            <p className="text-xs text-gray-400 uppercase font-semibold">Even geduld, gegevens worden opgehaald...</p>
          </div>
        ) : (
          <>
            {/* Medewerkers Tab */}
            {activeTab === 'users' && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                  <h3 className="text-sm sm:text-md font-bold mb-4">Nieuwe Medewerker</h3>
                  <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <input type="text" placeholder="Gebruikersnaam" value={newUser.username} onChange={(e) => setNewUser({...newUser, username: e.target.value})} className="p-2.5 sm:p-2 border rounded text-xs" required />
                    <input type="password" placeholder="Wachtwoord" value={newUser.password} onChange={(e) => setNewUser({...newUser, password: e.target.value})} className="p-2.5 sm:p-2 border rounded text-xs" required />
                    <select value={newUser.role} onChange={(e) => setNewUser({...newUser, role: e.target.value})} className="p-2.5 sm:p-2 border rounded text-xs">
                      <option value="cashier">Cashier</option>
                      <option value="admin">Admin</option>
                      <option value="super_admin">Super Admin</option>
                    </select>
                    <select value={newUser.store_id || ''} onChange={(e) => setNewUser({...newUser, store_id: e.target.value})} className="p-2.5 sm:p-2 border rounded text-xs">
                      <option value="">Kies Filiaal</option>
                      {stores.map(s => <option key={s.id || s.store_id} value={s.id || s.store_id}>{s.store_name || s.name}</option>)}
                    </select>
                    <button type="submit" className="bg-red-600 hover:bg-red-700 text-white font-bold p-2.5 sm:p-2 rounded text-xs uppercase sm:col-span-2 lg:col-span-1">Aanmaken</button>
                  </form>
                </div>

                <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                  <h3 className="text-sm sm:text-md font-bold mb-4">Medewerkers ({users.length})</h3>
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                    <table className="w-full text-left text-xs divide-min min-w-[500px]">
                      <thead><tr className="bg-gray-50"><th className="p-3">ID</th><th className="p-3">Naam</th><th className="p-3">Rol</th><th className="p-3">Filiaal</th><th className="p-3 text-right">Acties</th></tr></thead>
                      <tbody className="divide-y">
                        {users.map(u => {
                          const matchedStore = stores.find(s => String(s.id || s.store_id) === String(u.store_id));
                          const isBendemen = u.username.toLowerCase() === 'bendemen';
                          return (
                            <tr key={u.id} className="hover:bg-gray-50">
                              <td className="p-3">#{u.id}</td>
                              <td className="p-3 font-bold">{u.username}</td>
                              <td className="p-3"><span className="bg-gray-200 px-2 py-0.5 rounded uppercase font-semibold text-[10px]">{u.role}</span></td>
                              <td className="p-3 font-semibold text-gray-700">{matchedStore ? (matchedStore.store_name || matchedStore.name) : 'Geen'}</td>
                              <td className="p-3 text-right space-x-2">
                                {!isBendemen && (
                                  <>
                                    <button onClick={() => setEditingUser(u)} className="text-blue-600 font-bold hover:underline p-1">Bewerken</button>
                                    <button onClick={() => handleDeleteUser(u.id, u.username)} className="text-red-600 font-bold hover:underline p-1">Verwijderen</button>
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

            {/* Filialen Tab */}
            {activeTab === 'stores' && (
              <div className="space-y-6">
                <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                  <h3 className="text-sm sm:text-md font-bold mb-4">Nieuw Filiaal</h3>
                  <form onSubmit={handleCreateStore} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input type="text" placeholder="Naam Filiaal" value={newStore.store_name} onChange={(e) => setNewStore({...newStore, store_name: e.target.value})} className="p-2.5 sm:p-2 border rounded text-xs" required />
                    <input type="text" placeholder="Adres" value={newStore.address} onChange={(e) => setNewStore({...newStore, address: e.target.value})} className="p-2.5 sm:p-2 border rounded text-xs" required />
                    <input type="text" placeholder="KvK Nummer" value={newStore.kvk} onChange={(e) => setNewStore({...newStore, kvk: e.target.value})} className="p-2.5 sm:p-2 border rounded text-xs" required />
                    <input type="text" placeholder="BTW Nummer" value={newStore.btw} onChange={(e) => setNewStore({...newStore, btw: e.target.value})} className="p-2.5 sm:p-2 border rounded text-xs" required />
                    <input type="text" placeholder="Pickup ID" value={newStore.pickup_id} onChange={(e) => setNewStore({...newStore, pickup_id: e.target.value})} className="p-2.5 sm:p-2 border rounded text-xs sm:col-span-2" />
                    <button type="submit" className="bg-red-600 text-white font-bold p-2.5 sm:p-2 rounded text-xs uppercase sm:col-span-2">Aanmaken</button>
                  </form>
                </div>

                <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                  <h3 className="text-sm sm:text-md font-bold mb-4">Filialen ({stores.length})</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {stores.map(s => (
                      <div key={s.id || s.store_id} className="border p-4 rounded-lg bg-gray-50 flex flex-col justify-between space-y-3">
                        <div>
                          <div className="font-bold text-sm text-red-600">{s.store_name || s.name}</div>
                          <div className="text-xs text-gray-500 mt-1">📍 {s.address}</div>
                          <div className="text-xs text-gray-600 mt-1">KvK: {s.kvk} | BTW: {s.btw}</div>
                        </div>
                        <div className="text-right space-x-2 pt-2 border-t">
                          <button onClick={() => setEditingStore(s)} className="text-xs bg-black text-white px-3 py-1.5 rounded font-bold">Bewerken</button>
                          <button onClick={() => handleDeleteStore(s.id || s.store_id, s.store_name || s.name)} className="text-xs bg-red-600 text-white px-3 py-1.5 rounded font-bold">Verwijderen</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* SumUp Tab */}
            {activeTab === 'sumup' && (
              <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                <h3 className="text-sm sm:text-md font-bold mb-2">💳 SumUp Terminal & Pair Code Koppeling</h3>
                <p className="text-xs text-gray-500 mb-4">Beheer hier per filiaal de SumUp Terminal ID en Pair Code.</p>
                <div className="space-y-3">
                  {stores.map(s => (
                    <div key={s.id || s.store_id} className="border p-4 rounded flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-50">
                      <div>
                        <span className="font-bold text-sm">{s.store_name || s.name}</span>
                        <div className="text-xs text-gray-600 mt-1">
                          Terminal ID: <span className="font-mono font-bold text-black">{s.terminal_id || 'Geen'}</span>
                        </div>
                        <div className="text-xs text-gray-600 mt-0.5">
                          Pair Code: <span className="font-mono font-bold text-red-600">{s.pair_code || 'Geen'}</span>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 w-full sm:w-auto">
                        <button onClick={() => setEditingSumUp(s)} className="text-xs bg-black text-white px-3 py-2 rounded font-bold hover:bg-gray-850 flex-1 sm:flex-initial text-center">
                          Koppelen / Wijzigen
                        </button>
                        {(s.terminal_id || s.pair_code) && (
                          <button onClick={() => handleUnlinkSumUp(s.id || s.store_id)} className="text-xs bg-red-600 text-white px-3 py-2 rounded font-bold hover:bg-red-700 flex-1 sm:flex-initial text-center">
                            Ontkoppelen
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bestellingen Tab */}
            {activeTab === 'orders' && (
              <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                <h3 className="text-sm sm:text-md font-bold mb-4">📦 Live Bestellingen</h3>
                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <table className="w-full text-left text-xs divide-y mb-4 min-w-[500px]">
                    <thead><tr className="bg-gray-50"><th className="p-3">Order</th><th className="p-3">Klant</th><th className="p-3">Status</th><th className="p-3">Totaal</th></tr></thead>
                    <tbody className="divide-y">
                      {currentOrders.map(o => (
                        <tr key={o.id} className="hover:bg-gray-50">
                          <td className="p-3 font-bold">#{o.number || o.id}</td>
                          <td className="p-3">{o.billing?.first_name} {o.billing?.last_name}</td>
                          <td className="p-3">
                            <select value={o.status} onChange={(e) => handleUpdateOrderStatus(o.id, e.target.value)} className="border rounded p-1.5 text-xs font-bold">
                              <option value="pending">Pending</option>
                              <option value="processing">Processing</option>
                              <option value="completed">Completed</option>
                            </select>
                          </td>
                          <td className="p-3 font-bold text-red-600">€{parseFloat(o.total || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Voorraad Tab */}
            {activeTab === 'inventory' && (
              <div className="bg-white rounded-lg shadow p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                  <h3 className="text-sm sm:text-md font-bold">📦 Producten & Variaties Voorraad ({products.length})</h3>
                  <button onClick={handleManualSyncProducts} disabled={loading} className="bg-black text-white px-3 py-2 rounded text-xs font-bold w-full sm:w-auto">🔄 Sync</button>
                </div>

                <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <table className="w-full text-left text-xs divide-y min-w-[600px]">
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
                        const productVariations = Array.isArray(product.variations_data) && product.variations_data.length > 0 
                          ? product.variations_data 
                          : (Array.isArray(product.variations) && typeof product.variations[0] === 'object' ? product.variations : []);

                        return (
                          <React.Fragment key={product.id}>
                            <tr className="hover:bg-gray-50 font-semibold">
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
                          </React.Fragment>
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

      {/* Modals */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleUpdateUser} className="bg-white rounded-lg p-6 max-w-sm w-full space-y-3 shadow-xl">
            <h3 className="text-md font-bold">Medewerker Bewerken</h3>
            <input type="text" value={editingUser.username} onChange={(e) => setEditingUser({...editingUser, username: e.target.value})} className="w-full p-2.5 border rounded text-xs" required />
            <select value={editingUser.role} onChange={(e) => setEditingUser({...editingUser, role: e.target.value})} className="w-full p-2.5 border rounded text-xs">
              <option value="cashier">Cashier</option>
              <option value="admin">Admin</option>
              <option value="super_admin">Super Admin</option>
            </select>
            <div className="flex space-x-2 pt-2">
              <button type="button" onClick={() => setEditingUser(null)} className="w-1/2 bg-gray-200 py-2.5 rounded text-xs font-bold">Annuleren</button>
              <button type="submit" className="w-1/2 bg-red-600 text-white py-2.5 rounded text-xs font-bold">Opslaan</button>
            </div>
          </form>
        </div>
      )}

      {editingStore && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleUpdateStore} className="bg-white rounded-lg p-6 max-w-sm w-full space-y-3 shadow-xl">
            <h3 className="text-md font-bold">Filiaal Bewerken</h3>
            <input type="text" value={editingStore.store_name || editingStore.name || ''} onChange={(e) => setEditingStore({...editingStore, store_name: e.target.value})} className="w-full p-2.5 border rounded text-xs" required />
            <input type="text" value={editingStore.address || ''} onChange={(e) => setEditingStore({...editingStore, address: e.target.value})} className="w-full p-2.5 border rounded text-xs" required />
            <div className="flex space-x-2 pt-2">
              <button type="button" onClick={() => setEditingStore(null)} className="w-1/2 bg-gray-200 py-2.5 rounded text-xs font-bold">Annuleren</button>
              <button type="submit" className="w-1/2 bg-red-600 text-white py-2.5 rounded text-xs font-bold">Opslaan</button>
            </div>
          </form>
        </div>
      )}

      {editingSumUp && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <form onSubmit={handlePairSumUp} className="bg-white rounded-lg p-6 max-w-md w-full space-y-4 shadow-xl">
            <h3 className="text-md font-bold border-b pb-2">SumUp Koppelen: {editingSumUp.store_name || editingSumUp.name}</h3>
            
            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Terminal ID (Optioneel)</label>
              <input 
                type="text" 
                placeholder="Bijv. terminal_123" 
                value={editingSumUp.terminal_id || ''} 
                onChange={(e) => setEditingSumUp({...editingSumUp, terminal_id: e.target.value})} 
                className="w-full p-2.5 border rounded text-xs font-bold font-mono" 
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-600 block mb-1">Pair Code (Van de pinautomaat)</label>
              <input 
                type="text" 
                placeholder="Bijv. ABC123XYZ" 
                value={editingSumUp.pair_code || ''} 
                onChange={(e) => setEditingSumUp({...editingSumUp, pair_code: e.target.value})} 
                className="w-full p-2.5 border rounded text-xs font-bold font-mono text-red-600" 
              />
              <p className="text-[10px] text-gray-400 mt-1">Voer de actieve koppelcode in om te koppelen.</p>
            </div>

            <div className="flex space-x-2 pt-2">
              <button type="button" onClick={() => setEditingSumUp(null)} className="w-1/2 bg-gray-200 py-2.5 rounded text-xs font-bold">Annuleren</button>
              <button type="submit" className="w-1/2 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded text-xs font-bold">Koppelen & Opslaan</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}