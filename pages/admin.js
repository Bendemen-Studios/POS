import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import useSWR from 'swr';
import axios from 'axios';

const fetcher = (url) => axios.get(url).then((res) => res.data);

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('store'); // 'store', 'users', 'sumup', 'orders', 'products'

  // Winkelbeheer DB State
  const [storeId, setStoreId] = useState(null);
  const [storeName, setStoreName] = useState('');
  const [storeAddress, setStoreAddress] = useState('');
  const [registerStatus, setRegisterStatus] = useState('open');
  const [receiptHeader, setReceiptHeader] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [storeStatusMsg, setStoreStatusMsg] = useState('');

  // SumUp State
  const [pairingCode, setPairingCode] = useState('');
  const [isPairingSumup, setIsPairingSumup] = useState(false);

  // WooCommerce Live Data
  const { data: productsData, mutate: mutateProducts } = useSWR('/api/woocommerce/products', fetcher);
  const products = productsData?.products || [];

  const { data: ordersData, mutate: mutateOrders } = useSWR('/api/woocommerce/orders', fetcher, { refreshInterval: 10000 });
  const orders = ordersData?.orders || [];

  // Gebruikers DB
  const { data: usersData, mutate: mutateUsers } = useSWR('/api/admin/users', fetcher);
  const usersList = Array.isArray(usersData) ? usersData : (usersData?.users || []);

  useEffect(() => {
    const userStr = localStorage.getItem('pos_user');
    if (!userStr) {
      router.push('/login');
      return;
    }

    try {
      const parsedUser = JSON.parse(userStr);
      // Accepteer super_admin en admin
      if (parsedUser.role !== 'admin' && parsedUser.role !== 'super_admin') {
        alert('Geen toegang tot het Admin Panel.');
        router.push('/');
        return;
      }
      setUser(parsedUser);
      fetchStoreSettings();
    } catch (e) {
      router.push('/login');
    }
  }, []);

  const fetchStoreSettings = async () => {
    try {
      const res = await fetch('/api/admin/store');
      const data = await res.json();
      if (data.success && data.store) {
        setStoreId(data.store.id || null);
        setStoreName(data.store.store_name || '');
        setStoreAddress(data.store.address || '');
        setRegisterStatus(data.store.register_status || 'open');
        setReceiptHeader(data.store.receipt_header || '');
        setReceiptFooter(data.store.receipt_footer || '');
      }
    } catch (err) {
      console.error('Fout bij laden winkelbeheer:', err);
    }
  };

  const handleSaveStore = async (e) => {
    e.preventDefault();
    setStoreStatusMsg('Opslaan...');

    try {
      const res = await fetch('/api/admin/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: storeId,
          store_name: storeName,
          address: storeAddress,
          register_status: registerStatus,
          receipt_header: receiptHeader,
          receipt_footer: receiptFooter
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStoreStatusMsg('Winkelinstellingen opgeslagen!');
        fetchStoreSettings();
        setTimeout(() => setStoreStatusMsg(''), 3000);
      }
    } catch (err) {
      setStoreStatusMsg('Fout bij opslaan.');
    }
  };

  const handlePairSumup = async () => {
    if (!pairingCode) return alert('Voer de koppelcode in.');

    try {
      setIsPairingSumup(true);
      const res = await axios.post('/api/sumup/pair', {
        storeId: storeId || 1,
        pairingCode: pairingCode.trim(),
        readerName: `BDM POS - ${storeName || 'Hoofdvestiging'}`
      });

      if (res.data.success) {
        alert('SumUp terminal succesvol gekoppeld!');
        setPairingCode('');
      } else {
        alert('Koppelen mislukt: ' + res.data.error);
      }
    } catch (err) {
      alert('Fout bij koppelen: ' + (err.response?.data?.error || err.message));
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

      {/* Tabs Menu */}
      <div className="bg-white border-b px-6 py-2 flex space-x-2 overflow-x-auto">
        {[
          { id: 'store', label: '🏪 Winkelbeheer (DB)' },
          { id: 'users', label: '👥 Gebruikers & Personeel' },
          { id: 'sumup', label: '💳 SumUp Koppelen' },
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

      {/* Main Tab Content */}
      <div className="p-6 max-w-6xl mx-auto w-full">
        
        {/* TAB 1: WINKELBEHEER */}
        {activeTab === 'store' && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-bold mb-4">🏪 Filiaal & Kassaregister Instellingen</h2>
            <form onSubmit={handleSaveStore} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Winkelnaam / Filiaal</label>
                <input
                  type="text"
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Bijv. Ons Winkeltje"
                  className="w-full p-2 border rounded text-sm"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Adres / Locatie</label>
                <input
                  type="text"
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  placeholder="Bijv. Centrum Hellevoetsluis"
                  className="w-full p-2 border rounded text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Kassaregister Status</label>
                <select
                  value={registerStatus}
                  onChange={(e) => setRegisterStatus(e.target.value)}
                  className="w-full p-2 border rounded text-sm"
                >
                  <option value="open">🟢 Register Geopend</option>
                  <option value="closed">🔴 Register Gesloten</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Kassabon Header</label>
                <input
                  type="text"
                  value={receiptHeader}
                  onChange={(e) => setReceiptHeader(e.target.value)}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-xs font-bold text-gray-600 block mb-1">Kassabon Footer</label>
                <input
                  type="text"
                  value={receiptFooter}
                  onChange={(e) => setReceiptFooter(e.target.value)}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>

              <div className="md:col-span-2 flex items-center justify-between mt-2">
                <button
                  type="submit"
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2 rounded text-sm transition"
                >
                  Opslaan in Database
                </button>
                {storeStatusMsg && <span className="text-xs font-bold text-green-600">{storeStatusMsg}</span>}
              </div>
            </form>
          </div>
        )}

        {/* TAB 2: GEBRUIKERS & PERSONEEL */}
        {activeTab === 'users' && (
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-bold mb-4">👥 Actieve Kassa Gebruikers (MySQL)</h2>
            <div className="divide-y max-h-96 overflow-y-auto">
              {usersList.map((u) => (
                <div key={u.id} className="py-3 flex justify-between items-center text-sm">
                  <div>
                    <span className="font-bold block">{u.username}</span>
                    <span className="text-xs text-gray-500">{u.email || 'Geen e-mail'}</span>
                  </div>
                  <span className="bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded font-bold uppercase">
                    {u.role || 'cashier'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: SUMUP PAIRING */}
        {activeTab === 'sumup' && (
          <div className="bg-white p-6 rounded-lg shadow max-w-lg">
            <h2 className="text-lg font-bold mb-2">💳 SumUp Terminal Koppelen</h2>
            <p className="text-xs text-gray-600 mb-4">Voer de pairing code in die op het scherm van de SumUp Solo staat.</p>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Pairing Code (bijv. 8 tekens)"
                value={pairingCode}
                onChange={(e) => setPairingCode(e.target.value)}
                className="w-full p-2 border-2 border-black rounded font-mono font-bold text-lg"
              />
              <button
                onClick={handlePairSumup}
                disabled={isPairingSumup}
                className="w-full bg-black text-white font-bold py-2 rounded text-sm hover:bg-gray-800 transition"
              >
                {isPairingSumup ? 'Koppelen...' : '🔗 Koppel Terminal'}
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: BESTELLINGEN LIVE */}
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

        {/* TAB 5: VOORRAAD */}
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
    </div>
  );
}