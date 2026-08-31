import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import React from 'react';

export default function AdminDashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('admin_active_tab') || 'users' : 'users');
  const [users, setUsers] = useState(() => { if (typeof window !== 'undefined') { const saved = localStorage.getItem('admin_cached_users'); return saved ? JSON.parse(saved) : []; } return []; });
  const [stores, setStores] = useState(() => { if (typeof window !== 'undefined') { const saved = localStorage.getItem('admin_cached_stores'); return saved ? JSON.parse(saved) : []; } return []; });
  const [orders, setOrders] = useState(() => { if (typeof window !== 'undefined') { const saved = localStorage.getItem('admin_cached_orders'); return saved ? JSON.parse(saved) : []; } return []; });
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState(() => { if (typeof window !== 'undefined') { const saved = localStorage.getItem('admin_products'); return saved ? JSON.parse(saved) : []; } return []; });
  const [sumUpReaders, setSumUpReaders] = useState([]);
  const [pairingCode, setPairingCode] = useState('');
  const [terminalName, setTerminalName] = useState('');
  const [sumUpStatusMsg, setSumUpStatusMsg] = useState('');
  const [selectedStoreForReader, setSelectedStoreForReader] = useState({});
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'cashier', store_id: '', email: '' });
  const [newStore, setNewStore] = useState({ store_name: '', address: '', kvk: '', btw: '', pickup_id: '', payment_methods: { sumup: true, manual_pin: true, cash: true } });
  const [editingUser, setEditingUser] = useState(null);
  const [editingStore, setEditingStore] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ordersPerPage = 10;

  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('admin_active_tab', activeTab); if (activeTab === 'sumup') fetchSumUpReaders(); }, [activeTab]);
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('admin_products', JSON.stringify(products)); }, [products]);
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('admin_cached_users', JSON.stringify(users)); }, [users]);
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('admin_cached_stores', JSON.stringify(stores)); }, [stores]);
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('admin_cached_orders', JSON.stringify(orders)); }, [orders]);

  const formatAttributes = (attributes) => !Array.isArray(attributes) || !attributes.length ? '' : attributes.map(a => `${a.name || a.slug || 'Optie'}: ${a.option || 'Standaard'}`).join(' | ');

  useEffect(() => {
    const userStr = localStorage.getItem('pos_user');
    if (!userStr) { router.replace('/login'); return; }
    try { const parsed = JSON.parse(userStr); if (parsed.role !== 'admin' && parsed.role !== 'super_admin') { alert('Geen toegang tot het admin-gedeelte.'); router.replace('/'); return; } setCurrentUser(parsed); } catch (e) { router.replace('/login'); return; }
    fetchAllData();
  }, [router]);

  const fetchAllData = async () => {
    setLoading(true);
    await Promise.all([fetchUsers(), fetchStores(), fetchOrders(), fetchSumUpReaders(), fetchProductsSilently()]);
    setLoading(false);
  };

  const fetchUsers = async () => { try { const res = await fetch('/api/admin/users', { cache: 'no-store' }); const data = await res.json(); if (data.success && data.users) { setUsers(data.users); localStorage.setItem('admin_cached_users', JSON.stringify(data.users)); } } catch (err) { console.error('Fout bij ophalen gebruikers:', err); } };
  const fetchStores = async () => { try { const res = await fetch('/api/admin/store', { cache: 'no-store' }); const data = await res.json(); if (data.success) { const storeList = Array.isArray(data.stores) ? data.stores : (data.store ? [data.store] : []); const parsedStores = storeList.map(s => ({ ...s, payment_methods: typeof s.payment_methods === 'string' ? JSON.parse(s.payment_methods) : (s.payment_methods || { sumup: true, manual_pin: true, cash: true }) })); setStores(parsedStores); localStorage.setItem('admin_cached_stores', JSON.stringify(parsedStores)); } } catch (err) { console.error('Fout bij ophalen winkels:', err); } };
  const fetchSumUpReaders = async () => { try { const res = await fetch('/api/sumup/proxy?action=readers', { cache: 'no-store' }); const data = await res.json(); if (data.success) setSumUpReaders(data.readers || []); } catch (err) { console.error('Kan geen SumUp apparaten ophalen via proxy:', err); } };

  const fetchProductsSilently = async () => {
    try {
      const res = await fetch('/api/woocommerce/products?refresh=1', { cache: 'no-store', headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' } });
      const data = await res.json();
      if (!res.ok || !data.success || !Array.isArray(data.products)) throw new Error(data.error || `HTTP ${res.status}`);
      setProducts(data.products);
      localStorage.setItem('admin_products', JSON.stringify(data.products));
      return data.products;
    } catch (err) { console.error('[ADMIN PRODUCTS] Fout:', err); return []; }
  };

  const handleManualSyncProducts = async () => {
    setLoading(true);
    try {
      const list = await fetchProductsSilently();
      if (!list.length) throw new Error('De API gaf geen producten terug.');
      alert(`${list.length} producten succesvol gesynchroniseerd!`);
    } catch (err) { alert(`Producten synchroniseren mislukt: ${err.message}`); } finally { setLoading(false); }
  };

  const fetchOrders = async () => { try { const res = await fetch('/api/woocommerce/orders', { cache: 'no-store' }); const data = await res.json(); if (data.success && data.orders) { setOrders(data.orders); localStorage.setItem('admin_cached_orders', JSON.stringify(data.orders)); } } catch (err) { console.error('Fout bij ophalen bestellingen:', err); } };
  const handleUpdateOrderStatus = async (id,newStatus)=>{try{const res=await fetch('/api/woocommerce/orders',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,status:newStatus})});const data=await res.json();if(data.success){alert('Status bijgewerkt!');fetchOrders();}else alert('Fout bij updaten status.');}catch(err){alert('Fout bij updaten status.');}};

  return (<div className="min-h-screen bg-gray-100"><header className="bg-black text-white p-4"><div className="flex justify-between items-center"><h1 className="text-xl font-black">BDM POS // Admin Dashboard</h1><Link href="/" className="bg-gray-800 px-4 py-2 rounded font-bold text-sm">🛒 Terug naar Kassa</Link></div></header><div className="bg-white border-b p-2 flex gap-2 overflow-x-auto"><button onClick={()=>setActiveTab('users')} className="px-4 py-2 rounded text-xs font-bold">👥 Medewerkers</button><button onClick={()=>setActiveTab('stores')} className="px-4 py-2 rounded text-xs font-bold">📍 Filialen</button><button onClick={()=>setActiveTab('sumup')} className="px-4 py-2 rounded text-xs font-bold">💳 SumUp</button><button onClick={()=>setActiveTab('orders')} className="px-4 py-2 rounded text-xs font-bold">📦 Bestellingen</button><button onClick={()=>setActiveTab('inventory')} className="px-4 py-2 rounded text-xs font-bold bg-red-600 text-white">📦 Voorraad & Variaties</button></div><div className="p-6 max-w-7xl mx-auto"><div className="bg-white rounded-lg shadow p-6"><div className="flex justify-between items-center border-b pb-3 mb-4"><h3 className="font-bold">📦 Producten & Variaties Voorraad ({products.length})</h3><button onClick={handleManualSyncProducts} disabled={loading} className="bg-black text-white px-3 py-2 rounded text-xs font-bold">🔄 Sync</button></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="bg-gray-50"><th className="p-3">ID</th><th className="p-3">Naam</th><th className="p-3">Prijs</th><th className="p-3">Voorraad</th></tr></thead><tbody>{products.map(product=><React.Fragment key={product.id}><tr className="font-semibold"><td className="p-3">#{product.id}</td><td className="p-3">{product.name}</td><td className="p-3">{product.price?`€${parseFloat(product.price).toFixed(2)}`:'Vanaf prijs'}</td><td className="p-3">{product.stock_quantity!==null&&product.stock_quantity!==undefined?product.stock_quantity:'N.v.t.'}</td></tr>{product.type==='variable'&&(product.variations_data||[]).map(v=><tr key={`var_${v.id}`} className="bg-gray-50"><td className="p-3">↳ #{v.id}</td><td className="p-3">{formatAttributes(v.attributes)||`Variatie #${v.id}`}</td><td className="p-3">€{parseFloat(v.price||product.price||0).toFixed(2)}</td><td className="p-3">{v.stock_quantity!==null&&v.stock_quantity!==undefined?v.stock_quantity:'N.v.t.'}</td></tr>)}</React.Fragment>)}</tbody></table></div></div></div></div>);
}