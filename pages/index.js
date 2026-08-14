import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';

export default function CashierPOS() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [activeTab, setActiveTab] = useState('pos'); // 'pos' of 'pickup'

  // POS States
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [categories, setCategories] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [pointsUsed, setPointsUsed] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Custom Artikel Modal State
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  // Pickup Orders State
  const [pickupOrders, setPickupOrders] = useState([]);
  const [loadingPickup, setLoadingPickup] = useState(false);

  useEffect(() => {
    const userStr = localStorage.getItem('pos_user');
    if (!userStr) {
      router.push('/login');
      return;
    }
    try {
      const parsedUser = JSON.parse(userStr);
      setUser(parsedUser);
    } catch (e) {
      router.push('/login');
      return;
    }

    const storeStr = localStorage.getItem('selectedStore');
    if (storeStr) {
      try { setSelectedStore(JSON.parse(storeStr)); } catch (e) {}
    }

    fetchProducts();
    fetchCategories();
    fetchPickupOrders();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await axios.get('/api/woocommerce/products');
      if (res.data.success) setProducts(res.data.products || []);
    } catch (err) {
      console.error('Fout bij ophalen producten:', err);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await axios.get('/api/woocommerce/categories');
      if (res.data.success) setCategories(res.data.categories || []);
    } catch (err) {
      console.error('Fout bij ophalen categorieën:', err);
    }
  };

  const fetchPickupOrders = async () => {
    try {
      setLoadingPickup(true);
      const res = await axios.get('/api/woocommerce/pickup-orders');
      if (res.data.success) {
        setPickupOrders(res.data.orders || []);
      }
    } catch (err) {
      console.error('Fout bij ophalen afhaalbestellingen:', err);
    } finally {
      setLoadingPickup(false);
    }
  };

  const handleMarkAsPickedUp = async (orderId) => {
    if (!confirm(`Weet je zeker dat bestelling #${orderId} is opgehaald? De status wordt gewijzigd naar Verzonden.`)) return;
    try {
      const res = await axios.post('/api/woocommerce/update-order-status', {
        orderId,
        status: 'completed'
      });
      if (res.data.success) {
        setPickupOrders(prev => prev.filter(o => o.id !== orderId));
        alert(`Bestelling #${orderId} succesvol gemarkeerd als opgehaald!`);
      } else {
        alert('Fout bij bijwerken status: ' + (res.data.error || 'Onbekende fout'));
      }
    } catch (err) {
      alert('Fout bij bijwerken status: ' + (err.response?.data?.error || err.message));
    }
  };

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1, price: parseFloat(product.price || 0) }];
    });
  };

  const addCustomItem = (e) => {
    e.preventDefault();
    if (!customName || customPrice === '') return;
    const priceNum = parseFloat(customPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      alert('Vul een geldig bedrag in (minimaal €0,00).');
      return;
    }

    const customProduct = {
      id: `custom_${Date.now()}`,
      name: customName,
      price: priceNum,
      quantity: 1,
      is_custom: true
    };

    setCart(prev => [...prev, customProduct]);
    setCustomName('');
    setCustomPrice('');
    setShowCustomModal(false);
  };

  const updateQuantity = (id, delta) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : null;
      }
      return item;
    }).filter(Boolean));
  };

  const removeFromCart = (id) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const calculateTotals = () => {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discountAmount = parseFloat(discount) || 0;
    const pointsDiscount = (parseFloat(pointsUsed) || 0) * 0.10; // 10 cent per punt of eigen waarde
    const total = Math.max(0, subtotal - discountAmount - pointsDiscount);
    return { subtotal, discountAmount, pointsDiscount, total };
  };

  const handleCheckout = async (paymentMethod) => {
    if (cart.length === 0) {
      alert('Winkelmand is leeg.');
      return;
    }

    const totals = calculateTotals();
    const orderData = {
      orderItems: cart,
      paymentMethod,
      storeId: selectedStore?.id || 1,
      cashierId: user?.id || 1,
      customerId: customer?.id || 0,
      totals: {
        subtotal: totals.subtotal,
        discountAmount: totals.discountAmount,
        pointsUsed: parseFloat(pointsUsed) || 0,
        pointsDiscount: totals.pointsDiscount,
        totalPaid: totals.total
      }
    };

    try {
      setIsProcessing(true);
      const endpoint = paymentMethod === 'manual-order' ? '/api/woocommerce/manual-order' : '/api/woocommerce/order';
      const res = await axios.post(endpoint, orderData);

      if (res.data.success) {
        alert(`Bestelling #${res.data.orderId} succesvol geplaatst!`);
        setCart([]);
        setCustomer(null);
        setDiscount(0);
        setPointsUsed(0);
      } else {
        alert('Fout bij plaatsen bestelling: ' + res.data.error);
      }
    } catch (err) {
      alert('Fout bij afrekenen: ' + (err.response?.data?.error || err.message));
    } finally {
      setIsProcessing(false);
    }
  };

  const searchCustomers = async (query) => {
    setCustomerSearch(query);
    if (query.length < 2) {
      setCustomerResults([]);
      return;
    }
    try {
      const res = await axios.get(`/api/woocommerce/customers?search=${encodeURIComponent(query)}`);
      if (res.data.success) setCustomerResults(res.data.customers || []);
    } catch (err) {
      console.error('Fout bij zoeken naar klant:', err);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('pos_user');
    localStorage.removeItem('pos_token');
    router.push('/login');
  };

  const totals = calculateTotals();

  // Filter afhaalbestellingen op basis van het pickup_id van het geselecteerde filiaal
  const filteredPickupOrders = pickupOrders.filter(order => {
    if (!selectedStore?.pickup_id) return true;
    return order.shipping_lines?.some(s => s.meta_data?.some(m => m.key === 'pickup_location_id' && m.value === selectedStore.pickup_id));
  });

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || p.categories?.some(c => c.id.toString() === selectedCategory);
    return matchesSearch && matchesCategory;
  });

  if (!user) return <div className="p-8 text-center font-bold">Laden...</div>;

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Top Header */}
      <header className="bg-black text-white p-4 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-3">
          <span className="font-bold text-xl tracking-wider">BDM POS</span>
          {selectedStore && (
            <span className="text-xs bg-red-600 px-2 py-1 rounded font-bold uppercase">
              📍 {selectedStore.store_name}
            </span>
          )}
          <span className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded">
            {user.username} ({user.role})
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('pos')}
            className={`px-3 py-1.5 rounded text-xs font-bold transition ${activeTab === 'pos' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300'}`}
          >
            🛒 Kassa
          </button>
          <button
            onClick={() => { setActiveTab('pickup'); fetchPickupOrders(); }}
            className={`px-3 py-1.5 rounded text-xs font-bold transition flex items-center space-x-1 ${activeTab === 'pickup' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300'}`}
          >
            <span>📦 Afhaalbalie</span>
            {filteredPickupOrders.length > 0 && (
              <span className="bg-white text-black px-1.5 py-0.2 rounded-full text-[10px]">
                {filteredPickupOrders.length}
              </span>
            )}
          </button>

          {(user.role === 'admin' || user.role === 'super_admin') && (
            <button
              onClick={() => router.push('/admin')}
              className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded text-xs font-semibold transition"
            >
              ⚙️ Admin
            </button>
          )}

          <button
            onClick={handleLogout}
            className="bg-red-700 hover:bg-red-800 text-white px-3 py-1.5 rounded text-xs font-semibold transition"
          >
            🚪 Loguit
          </button>
        </div>
      </header>

      {/* Main Content: POS of Pickup */}
      {activeTab === 'pickup' ? (
        <div className="flex-1 p-6 max-w-6xl mx-auto w-full">
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <div className="flex justify-between items-center pb-4 border-b">
              <div>
                <h2 className="text-lg font-bold">📦 Lokale Afhaalbestellingen (Local Pickup Plus)</h2>
                <p className="text-xs text-gray-500">Overzicht van webshopbestellingen die klaarstaan om in deze vestiging te worden opgehaald.</p>
              </div>
              <button
                onClick={fetchPickupOrders}
                disabled={loadingPickup}
                className="bg-black hover:bg-gray-800 text-white text-xs font-bold px-4 py-2 rounded transition"
              >
                {loadingPickup ? '⏳ Laden...' : '🔄 Verversen'}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs divide-y">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="p-3">Order ID</th>
                    <th className="p-3">Klant</th>
                    <th className="p-3">Afhaallocatie</th>
                    <th className="p-3">Artikelen</th>
                    <th className="p-3">Totaal</th>
                    <th className="p-3 text-right">Actie</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredPickupOrders.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-8 text-center text-gray-400">
                        {loadingPickup ? 'Bestellingen ophalen...' : 'Geen openstaande afhaalbestellingen voor deze locatie.'}
                      </td>
                    </tr>
                  ) : (
                    filteredPickupOrders.map(order => {
                      const shippingLine = order.shipping_lines?.[0];
                      const pickupLocation = shippingLine?.meta_data?.find(m => m.key === 'Pickup Location' || m.key === 'location')?.value || shippingLine?.method_title || 'Lokale Afhaling';

                      return (
                        <tr key={order.id} className="hover:bg-gray-50">
                          <td className="p-3 font-bold">#{order.id}</td>
                          <td className="p-3 font-medium">
                            {order.billing?.first_name} {order.billing?.last_name}
                            <div className="text-[10px] text-gray-400">{order.billing?.email}</div>
                          </td>
                          <td className="p-3 text-gray-700 font-semibold">📍 {pickupLocation}</td>
                          <td className="p-3 text-gray-600 max-w-xs truncate">
                            {order.line_items?.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                          </td>
                          <td className="p-3 font-bold text-red-600">€{parseFloat(order.total || 0).toFixed(2)}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleMarkAsPickedUp(order.id)}
                              className="bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-2 rounded text-xs uppercase shadow-sm"
                            >
                              ✓ Als opgehaald markeren
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col md:flex-row p-4 gap-4 overflow-hidden">
          {/* Left: Product Catalog & Search */}
          <div className="flex-1 flex flex-col bg-white rounded-lg shadow p-4 overflow-hidden">
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Zoek producten..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 p-2 border rounded text-sm"
              />
              <button
                onClick={() => setShowCustomModal(true)}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded text-xs whitespace-nowrap transition"
              >
                + Custom Artikel
              </button>
            </div>

            {/* Categories */}
            <div className="flex gap-2 pb-2 overflow-x-auto mb-4 border-b">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1 rounded text-xs font-bold whitespace-nowrap ${selectedCategory === 'all' ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                Alles
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id.toString())}
                  className={`px-3 py-1 rounded text-xs font-bold whitespace-nowrap ${selectedCategory === cat.id.toString() ? 'bg-black text-white' : 'bg-gray-100 text-gray-700'}`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Products Grid */}
            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredProducts.map(product => (
                <div
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="bg-gray-50 hover:bg-gray-100 border rounded-lg p-3 flex flex-col justify-between cursor-pointer transition shadow-sm"
                >
                  {product.images?.[0]?.src && (
                    <div className="w-full h-28 bg-white mb-2 rounded overflow-hidden flex items-center justify-center">
                      <img src={product.images[0].src} alt={product.name} className="object-cover w-full h-full" />
                    </div>
                  )}
                  <span className="text-xs font-bold text-gray-800 line-clamp-2">{product.name}</span>
                  <span className="text-xs font-bold text-red-600 mt-2">€{parseFloat(product.price || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Cart & Checkout Sidebar */}
          <div className="w-full md:w-96 bg-white rounded-lg shadow p-4 flex flex-col justify-between">
            <div>
              <h2 className="text-md font-bold mb-3 pb-2 border-b">🛒 Winkelmand</h2>
              
              {/* Customer selection */}
              <div className="mb-3 relative">
                <input
                  type="text"
                  placeholder="Zoek klant op naam/email..."
                  value={customer ? `${customer.first_name} ${customer.last_name}` : customerSearch}
                  onChange={(e) => searchCustomers(e.target.value)}
                  className="w-full p-2 border rounded text-xs"
                />
                {customer && (
                  <button onClick={() => setCustomer(null)} className="absolute right-2 top-2 text-xs text-red-600 font-bold">✕</button>
                )}
                {customerResults.length > 0 && !customer && (
                  <div className="absolute z-10 w-full bg-white border rounded shadow-md mt-1 max-h-40 overflow-y-auto">
                    {customerResults.map(c => (
                      <div
                        key={c.id}
                        onClick={() => { setCustomer(c); setCustomerResults([]); }}
                        className="p-2 hover:bg-gray-100 text-xs cursor-pointer border-b"
                      >
                        {c.first_name} {c.last_name} ({c.email})
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Cart Items */}
              <div className="max-h-60 overflow-y-auto divide-y mb-3">
                {cart.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">Winkelmand is leeg</p>
                ) : (
                  cart.map(item => (
                    <div key={item.id} className="py-2 flex justify-between items-center text-xs">
                      <div className="flex-1 pr-2">
                        <div className="font-bold">{item.name}</div>
                        <div className="text-gray-500">€{item.price.toFixed(2)} x {item.quantity}</div>
                      </div>
                      <div className="flex items-center space-x-1">
                        <button onClick={() => updateQuantity(item.id, -1)} className="px-2 py-0.5 bg-gray-200 rounded font-bold">-</button>
                        <span className="px-1 font-bold">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="px-2 py-0.5 bg-gray-200 rounded font-bold">+</button>
                        <button onClick={() => removeFromCart(item.id)} className="text-red-600 font-bold px-1 ml-1">🗑️</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Totals & Actions */}
            <div className="border-t pt-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span>Subtotaal:</span>
                <span className="font-bold">€{totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs items-center">
                <span>Handmatige Korting (€):</span>
                <input
                  type="number"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="w-20 p-1 border rounded text-xs text-right"
                  placeholder="0.00"
                />
              </div>
              <div className="flex justify-between text-sm font-bold border-t pt-2">
                <span>Totaal:</span>
                <span className="text-red-600">€{totals.total.toFixed(2)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={() => handleCheckout('cash')}
                  disabled={isProcessing}
                  className="bg-black text-white py-2 rounded text-xs font-bold hover:bg-gray-800 transition"
                >
                  💵 Contant
                </button>
                <button
                  onClick={() => handleCheckout('sumup')}
                  disabled={isProcessing}
                  className="bg-blue-600 text-white py-2 rounded text-xs font-bold hover:bg-blue-700 transition"
                >
                  💳 SumUp Pin
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CUSTOM ARTIKEL */}
      {showCustomModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full space-y-4">
            <h3 className="text-md font-bold">Handmatig Custom Artikel Toevoegen</h3>
            <form onSubmit={addCustomItem} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Productnaam / Omschrijving</label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="Bijv. Servicekosten / Overig"
                  className="w-full p-2 border rounded text-xs"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Bedrag (€)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2 border rounded text-xs font-bold text-red-600"
                  required
                />
              </div>
              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="w-1/2 bg-gray-200 p-2 rounded text-xs font-bold"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  className="w-1/2 bg-red-600 text-white p-2 rounded text-xs font-bold"
                >
                  Toevoegen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}