import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const SERVER_TIMEOUT_MS = 4000;

export default function SelectStore() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const userStr = localStorage.getItem('pos_user');
    if (!userStr) {
      window.location.replace('/login');
      return;
    }
    try {
      const parsedUser = JSON.parse(userStr);
      setCurrentUser(parsedUser);
      let loginStores = [];
      try { loginStores = JSON.parse(localStorage.getItem('pos_login_stores') || '[]'); } catch (_) {}
      if (Array.isArray(loginStores) && loginStores.length) {
        setStores(filterStoresForUser(loginStores, parsedUser));
        setLoading(false);
        fetchUserStores(parsedUser); // background refresh only
      } else fetchUserStores(parsedUser);
    } catch (e) {
      window.location.replace('/login');
    }
  }, [router]);

  const isAdmin = (user) => {
    const role = String(user?.role || '').toLowerCase();
    return role === 'admin' || role === 'super_admin' || role === 'administrator' || String(user?.username || '').toLowerCase() === 'bendemen';
  };

  const filterStoresForUser = (allStores, user) => {
    if (!Array.isArray(allStores)) return [];
    if (isAdmin(user)) return allStores;

    const assignedStoreId = user?.store_id == null ? '' : String(user.store_id).trim();
    if (!assignedStoreId) return [];

    const assignedIds = new Set(
      assignedStoreId.split(',').map(id => id.trim()).filter(Boolean)
    );

    return allStores.filter(store => assignedIds.has(String(store?.id ?? store?.store_id ?? '').trim()));
  };

  const readCachedStores = (user) => {
    try {
      const raw = localStorage.getItem('cached_pos_stores');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      // Never expose cached stores that are not assigned to this user.
      return filterStoresForUser(parsed, user);
    } catch (_) { return []; }
  };

  const applyStores = (nextStores, offline = false) => {
    if (!Array.isArray(nextStores) || nextStores.length === 0) return false;
    setStores(nextStores);
    setLoading(false);
    setError(offline ? '⚠️ Offline modus: lokale filialen gebruikt.' : '');
    return true;
  };

  const fetchUserStores = async (user) => {
    setError('');

    // The cache is filtered by the current user's assignment before it is shown.
    const cachedStores = readCachedStores(user);
    if (cachedStores.length) applyStores(cachedStores);

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setLoading(false);
      if (!cachedStores.length) {
        setError('Geen verbinding met de server en geen toegewezen filiaalcache beschikbaar.');
      }
      return;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS);
      const res = await fetch(`/api/auth/store-selection?user_id=${encodeURIComponent(user.id)}`, {
        headers: { 'x-user-id': String(user.id), 'Cache-Control': 'no-cache' },
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeoutId);
      const data = await res.json();

      if (res.ok && data.success && Array.isArray(data.stores)) {
        // Keep a server response authoritative, but apply the same client-side
        // restriction as a defence-in-depth measure before rendering it.
        const allowedStores = filterStoresForUser(data.stores, user);
        setStores(allowedStores);
        localStorage.setItem('cached_pos_stores', JSON.stringify(data.stores));
        setLoading(false);
        setError('');
        return;
      }

      if (!cachedStores.length) {
        setError(data.message || 'Geen toegewezen filialen gevonden.');
        setLoading(false);
      }
    } catch (err) {
      console.warn('Server offline of timeout, lokale toegewezen filialen blijven actief.', err);
      if (!cachedStores.length) {
        setError('Geen verbinding met de server en geen lokale filiaalcache beschikbaar.');
        setLoading(false);
      } else {
        setError('⚠️ Server reageert niet snel genoeg; lokale toegewezen filialen worden gebruikt.');
      }
    }
  };

  const selectStore = (store) => {
    let parsedMethods;
    try {
      parsedMethods = typeof store.payment_methods === 'string' ? JSON.parse(store.payment_methods) : (store.payment_methods || { sumup: true, manual_pin: true, cash: true });
    } catch (_) { parsedMethods = { sumup: true, manual_pin: true, cash: true }; }
    const storeData = { id: store.id, store_id: store.id, name: store.store_name || store.name, store_name: store.store_name || store.name, location: store.address || '', address: store.address || '', pickup_id: store.pickup_id || null, terminal_id: store.terminal_id || null, payment_methods: parsedMethods };
    localStorage.setItem('selectedStore', JSON.stringify(storeData));
    localStorage.setItem('pos_selected_store', JSON.stringify(storeData));
    window.location.replace('/');
  };

  const handleLogout = () => { localStorage.removeItem('pos_user'); localStorage.removeItem('pos_token'); window.location.replace('/login'); };

  if (!currentUser) return null;
  return <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4"><div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full border border-gray-200"><div className="text-center mb-8"><h1 className="text-2xl font-black text-black tracking-wider uppercase">Kies je Vestiging</h1><p className="text-xs text-gray-500 font-semibold mt-1">Selecteer een filiaal om de kassa te openen</p></div>{loading && <div className="text-center py-8 space-y-2"><div className="text-red-600 font-black text-xs tracking-widest uppercase animate-pulse">Filialen ophalen...</div></div>}{error && <div className="bg-yellow-50 border-l-4 border-yellow-600 text-yellow-800 p-3 rounded text-xs mb-4 font-semibold">{error}</div>}{!loading && stores.length === 0 && <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded text-center text-xs font-bold">Geen actieve filialen gekoppeld aan jouw account.</div>}{!loading && stores.length > 0 && <div className="space-y-3">{stores.map(store => <button key={store.id} onClick={() => selectStore(store)} type="button" className="w-full p-4 bg-gray-50 border border-gray-300 hover:border-black rounded-lg transition flex justify-between items-center text-left group shadow-sm"><div><h3 className="font-bold text-sm text-gray-900 group-hover:text-black">{store.store_name || store.name}</h3>{store.address && <span className="text-xs text-gray-500 font-medium block mt-0.5">{store.address}</span>}</div><span className="text-lg font-black text-red-600 transition-transform group-hover:translate-x-1">→</span></button>)}</div>}<button onClick={handleLogout} type="button" className="mt-8 w-full text-center text-xs text-gray-500 hover:text-red-600 font-bold transition uppercase tracking-wider">← Uitloggen / Ander account</button></div></div>;
}
