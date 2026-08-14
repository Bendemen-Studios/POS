import { useState, useEffect } from 'react';
import axios from 'axios';

export default function PickupDashboard() {
  const [orders, setOrders] = useState([]);
  const [selectedStore, setSelectedStore] = useState(null);

  useEffect(() => {
    const store = JSON.parse(localStorage.getItem('selectedStore') || '{}');
    setSelectedStore(store);
    fetchPickupOrders();
  }, []);

  const fetchPickupOrders = async () => {
    const res = await axios.get('/api/woocommerce/pickup-orders');
    setOrders(res.data.orders || []);
  };

  const handleMarkAsPickedUp = async (orderId) => {
    await axios.post('/api/woocommerce/update-order-status', { orderId, status: 'completed' });
    fetchPickupOrders();
  };

  const filteredOrders = orders.filter(o => {
    if (!selectedStore?.pickup_id) return true;
    return o.shipping_lines?.some(s => s.meta_data?.some(m => m.key === 'pickup_location_id' && m.value === selectedStore.pickup_id));
  });

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-xl font-bold mb-4">📦 Afhaalbalie: {selectedStore?.store_name || 'Alle'}</h1>
      <table className="w-full bg-white rounded shadow text-xs">
        <thead><tr className="bg-gray-50 text-left"><th className="p-3">Order</th><th className="p-3">Klant</th><th className="p-3 text-right">Actie</th></tr></thead>
        <tbody>
          {filteredOrders.map(o => (
            <tr key={o.id} className="border-t">
              <td className="p-3 font-bold">#{o.id}</td>
              <td className="p-3">{o.billing?.first_name} {o.billing?.last_name}</td>
              <td className="p-3 text-right">
                <button onClick={() => handleMarkAsPickedUp(o.id)} className="bg-green-600 text-white px-3 py-1 rounded font-bold">✓ Opgehaald</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}