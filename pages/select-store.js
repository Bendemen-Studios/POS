import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function SelectStore() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const userStr = localStorage.getItem('pos_user');
    if (!userStr) {
      router.replace('/login');
      return;
    }

    try {
      const parsedUser = JSON.parse(userStr);
      setCurrentUser(parsedUser);
      fetchUserStores(parsedUser.id);
    } catch (e) {
      router.replace('/login');
    }
  }, [router]);

  const fetchUserStores = async (userId) => {
    setLoading(true);
    setError('');

    // Probeer direct vanuit de cache te laden als fallback of als we offline zijn
    const loadFromCache = () => {
      const cachedStores = localStorage.getItem('cached_pos_stores');
      if (cachedStores) {
        try {
          const parsedStores = JSON.parse(cachedStores);
          setStores(parsedStores);
          setError('⚠️ Offline modus: Filialen geladen via lokale reserve-cache.');
          setLoading(false);
          return true;
        } catch (e) {
          return false;
        }
      }
      return false;
    };

    try {
      // Timeout instellen op 3 seconden zodat hij bij een dode VPS niet blijft hangen
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(`/api/auth/store-selection?user_id=${userId}`, {
        headers: { 'x-user-id': String(userId) },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await res.json();

      if (res.ok && data.success && Array.isArray(data.stores)) {
        setStores(data.stores);
        localStorage.setItem('cached_pos_stores', JSON.stringify(data.stores));
        setLoading(false);
      } else {
        throw new Error(data.message || 'Geen toegewezen filialen gevonden.');
      }
    } catch (err) {
      console.warn('Server offline of traag, val terug op cache...', err);
      const success = loadFromCache();
      if (!success) {
        setError('Geen verbinding met de server en geen lokale filiaalcache beschikbaar.');
        setLoading(false);
      }
    }
  };

  const selectStore = (store) => {
    const parsedMethods = typeof store.payment_methods === 'string'
      ? JSON.parse(store.payment_methods)
      : (store.payment_methods || { sumup: true, manual_pin: true, cash: true });

    const storeData = {
      id: store.id,
      store_id: store.id,
      name: store.store_name || store.name,
      store_name: store.store_name || store.name,
      location: store.address || '',
      address: store.address || '',
      pickup_id: store.pickup_id || null,
      terminal_id: store.terminal_id || null,
      payment_methods: parsedMethods
    };

    localStorage.setItem('selectedStore', JSON.stringify(storeData));
    localStorage.setItem('pos_selected_store', JSON.stringify(storeData));

    router.replace('/');
  };

  const handleLogout = () => {
    localStorage.clear();
    router.replace('/login');
  };

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full border border-gray-200">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-black tracking-wider uppercase">Kies je Vestiging</h1>
          <p className="text-xs text-gray-500 font-semibold mt-1">
            Selecteer een filiaal om de kassa te openen
          </p>
        </div>

        {loading && (
          <div className="text-center py-8 space-y-2">
            <div className="text-red-600 font-black text-xs tracking-widest uppercase animate-pulse">Filialen ophalen...</div>
          </div>
        )}

        {error && (
          <div className="bg-yellow-50 border-l-4 border-yellow-600 text-yellow-800 p-3 rounded text-xs mb-4 font-semibold">
            {error}
          </div>
        )}

        {!loading && stores.length === 0 && !error && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-4 rounded text-center text-xs font-bold">
            Geen actieve filialen gekoppeld aan jouw account.
          </div>
        )}

        {!loading && stores.length > 0 && (
          <div className="space-y-3">
            {stores.map((store) => (
              <button
                key={store.id}
                onClick={() => selectStore(store)}
                type="button"
                className="w-full p-4 bg-gray-50 border border-gray-300 hover:border-black rounded-lg transition flex justify-between items-center text-left group shadow-sm"
              >
                <div>
                  <h3 className="font-bold text-sm text-gray-900 group-hover:text-black">
                    {store.store_name}
                  </h3>
                  {store.address && (
                    <span className="text-xs text-gray-500 font-medium block mt-0.5">
                      {store.address}
                    </span>
                  )}
                </div>
                <span className="text-lg font-black text-red-600 transition-transform group-hover:translate-x-1">
                  →
                </span>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={handleLogout}
          type="button"
          className="mt-8 w-full text-center text-xs text-gray-500 hover:text-red-600 font-bold transition uppercase tracking-wider"
        >
          ← Uitloggen / Ander account
        </button>
      </div>
    </div>
  );
}