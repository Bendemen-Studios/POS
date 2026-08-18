import { useState, useEffect } from 'react';
import axios from 'axios';

export default function PickupDashboard() {
  const [orders, setOrders] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pos_cached_pickup_orders');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  
  const [selectedStore, setSelectedStore] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const store = JSON.parse(localStorage.getItem('selectedStore') || '{}');
    setSelectedStore(store);
    fetchPickupOrders();
    triggerOfflinePickupSync();

    const handleOnline = () => triggerOfflinePickupSync();
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && orders.length > 0) {
      localStorage.setItem('pos_cached_pickup_orders', JSON.stringify(orders));
    }
  }, [orders]);

  const fetchPickupOrders = async () => {
    try {
      // Aangepast naar het correcte endpoint dat we hebben aangemaakt
      const res = await axios.get('/api/woocommerce/pickup-order');
      if (res.data && res.data.orders) {
        setOrders(res.data.orders);
        localStorage.setItem('pos_cached_pickup_orders', JSON.stringify(res.data.orders));
      }
    } catch (err) {
      console.warn('Geen verbinding met server, laadt afhaalbestellingen uit lokale cache.', err);
    }
  };

  const triggerOfflinePickupSync = async () => {
    const queue = JSON.parse(localStorage.getItem('pos_offline_pickup_actions') || '[]');
    if (queue.length === 0) return;

    setIsSyncing(true);
    const remainingQueue = [];

    for (const action of queue) {
      try {
        // Gebruikt nu de juiste PUT methode en het juiste endpoint
        await axios.put('/api/woocommerce/pickup-order', { 
          order_id: action.orderId, 
          status: action.status 
        });
      } catch (err) {
        remainingQueue.push(action);
      }
    }

    localStorage.setItem('pos_offline_pickup_actions', JSON.stringify(remainingQueue));
    setIsSyncing(false);
    fetchPickupOrders();
  };

  const handleMarkAsPickedUp = async (orderId) => {
    if (!confirm(`Weet je zeker dat bestelling #${orderId} is opgehaald?`)) return;

    const updatedOrders = orders.filter(o => o.id !== orderId);
    setOrders(updatedOrders);
    localStorage.setItem('pos_cached_pickup_orders', JSON.stringify(updatedOrders));

    try {
      await axios.put('/api/woocommerce/pickup-order', { order_id: orderId, status: 'completed' });
    } catch (err) {
      console.warn('Server niet bereikbaar. Actie opgeslagen in offline wachtrij.');
      
      const queue = JSON.parse(localStorage.getItem('pos_offline_pickup_actions') || '[]');
      queue.push({ orderId, status: 'completed', timestamp: new Date().toISOString() });
      localStorage.setItem('pos_offline_pickup_actions', JSON.stringify(queue));
      
      alert('⚠️ Geen verbinding met de server. De statuswijziging is lokaal opgeslagen en wordt gesynchroniseerd zodra er internet is.');
    }
  };

  const filteredOrders = orders.filter(o => {
    if (!selectedStore?.pickup_id) return true;
    return o.shipping_lines?.some(s => s.meta_data?.some(m => m.key === 'pickup_location_id' && String(m.value) === String(selectedStore.pickup_id)));
  });

  return (
    <div className="p-4 sm:p-6 bg-gray-100 min-h-screen">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-lg sm:text-xl font-bold">📦 Afhaalbalie: {selectedStore?.store_name || selectedStore?.name || 'Alle'}</h1>
        <button 
          onClick={fetchPickupOrders} 
          className="bg-black text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-gray-800"
        >
          {isSyncing ? '⏳ Syncing...' : '🔄 Verversen'}
        </button>
      </div>

      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="w-full text-xs min-w-[500px]">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="p-3">Order</th>
              <th className="p-3">Klant</th>
              <th className="p-3">Artikelen</th>
              <th className="p-3 text-right">Actie</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan="4" className="p-6 text-center text-gray-400">
                  Geen openstaande afhaalbestellingen gevonden.
                </td>
              </tr>
            ) : (
              filteredOrders.map(o => (
                <tr key={o.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-bold">#{o.number || o.id}</td>
                  <td className="p-3">
                    <div className="font-semibold">{o.billing?.first_name} {o.billing?.last_name}</div>
                    <div className="text-[10px] text-gray-400">{o.billing?.email}</div>
                  </td>
                  <td className="p-3 text-gray-600 max-w-xs truncate">
                    {o.line_items?.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                  </td>
                  <td className="p-3 text-right">
                    <button 
                      onClick={() => handleMarkAsPickedUp(o.id)} 
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded font-bold uppercase shadow-sm"
                    >
                      ✓ Opgehaald
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}