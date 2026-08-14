import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function POSHome() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Klant & Punten state
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [redeemedDiscount, setRedeemedDiscount] = useState(0);

  // Korting & Voucher state
  const [discountType, setDiscountType] = useState('none'); // 'none', 'percentage', 'fixed'
  const [discountValue, setDiscountValue] = useState(0);
  const [couponCode, setCouponCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState(null);

  // Ophalen producten en klanten bij laden
  useEffect(() => {
    fetchProducts();
    fetchCustomers();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/woocommerce/products');
      const data = await res.json();
      if (data.success) setProducts(data.products || []);
    } catch (err) {
      console.error('Fout bij ophalen producten:', err);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/woocommerce/customers');
      const data = await res.json();
      if (data.success) setCustomers(data.customers || []);
    } catch (err) {
      console.error('Fout bij ophalen klanten:', err);
    }
  };

  // Winkelmand acties
  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const updateQuantity = (id, delta) => {
    setCart((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, quantity: item.quantity + delta } : item))
        .filter((item) => item.quantity > 0)
    );
  };

  // Berekeningen
  const subtotal = cart.reduce((acc, item) => acc + parseFloat(item.price || 0) * item.quantity, 0);

  // Korting berekenen
  let manualDiscountAmount = 0;
  if (discountType === 'percentage') {
    manualDiscountAmount = (subtotal * parseFloat(discountValue || 0)) / 100;
  } else if (discountType === 'fixed') {
    manualDiscountAmount = parseFloat(discountValue || 0);
  }

  // Totale korting = handmatige korting + ingewisselde punten korting
  const totalDiscount = Math.min(subtotal, manualDiscountAmount + parseFloat(redeemedDiscount || 0));
  const finalTotal = Math.max(0, subtotal - totalDiscount);

  // Punten inwisselen logica (100 punten = €5 -> 1 punt = €0.05, vanaf 1 punt)
  const handleRedeemPoints = () => {
    const pts = parseInt(pointsToRedeem) || 0;
    if (pts <= 0) {
      setRedeemedDiscount(0);
      return;
    }
    if (!selectedCustomer) {
      alert('Koppel eerst een klant voordat je punten kunt inwisselen.');
      return;
    }
    const discount = pts * 0.05; // 1 punt = 5 cent
    if (discount > subtotal) {
      alert('De korting door punten kan niet hoger zijn dan het subtotaal.');
      return;
    }
    setRedeemedDiscount(discount.toFixed(2));
  };

  // Afrekenen (Pin Handmatig)
  const handleCheckout = async () => {
    if (cart.length === 0) {
      alert('Winkelmand is leeg.');
      return;
    }

    setLoading(true);
    setCheckoutStatus(null);

    try {
      const line_items = cart.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
      }));

      const orderData = {
        payment_method: 'manual_pin',
        payment_method_title: 'Handmatige Pin',
        set_paid: true,
        customer_id: selectedCustomer ? selectedCustomer.id : 0,
        line_items: line_items,
        fee_lines: totalDiscount > 0 ? [
          {
            name: `Korting & Rewards (${pointsToRedeem ? pointsToRedeem + ' punten' : 'Actie'})`,
            total: (-totalDiscount).toFixed(2),
          }
        ] : []
      };

      const res = await fetch('/api/woocommerce/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
      });

      const data = await res.json();

      if (data.success) {
        setCheckoutStatus({ success: true, message: `Bestelling #${data.order.id} succesvol aangemaakt!` });
        setCart([]);
        setSelectedCustomer(null);
        setPointsToRedeem(0);
        setRedeemedDiscount(0);
        setDiscountType('none');
        setDiscountValue(0);
      } else {
        setCheckoutStatus({ success: false, message: data.error || 'Fout bij aanmaken bestelling.' });
      }
    } catch (err) {
      console.error(err);
      setCheckoutStatus({ success: false, message: 'Netwerkfout tijdens afrekenen.' });
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCustomers = customers.filter((c) =>
    `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(customerSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-black text-white p-4 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-4">
          <span className="font-bold text-xl tracking-wider">BDM POS</span>
        </div>
        <div className="flex items-center space-x-3">
          <Link href="/admin">
            <button className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm font-semibold transition">
              Admin Panel
            </button>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col md:flex-row p-4 gap-4 overflow-hidden">
        
        {/* Left: Product Catalog */}
        <div className="w-full md:w-3/5 flex flex-col bg-white rounded-lg shadow p-4">
          <div className="mb-4">
            <input
              type="text"
              placeholder="Zoek producten..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[calc(100vh-220px)]">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                onClick={() => addToCart(product)}
                className="bg-gray-50 border border-gray-200 rounded p-3 flex flex-col justify-between cursor-pointer hover:border-black transition"
              >
                <div>
                  <h3 className="font-semibold text-sm line-clamp-2">{product.name}</h3>
                </div>
                <div className="mt-2 text-right font-bold text-red-600">
                  €{parseFloat(product.price || 0).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Cart, Customer & Checkout */}
        <div className="w-full md:w-2/5 flex flex-col bg-white rounded-lg shadow p-4 justify-between">
          <div>
            <h2 className="text-lg font-bold mb-3 border-b pb-2">Huidige Bestelling</h2>

            {/* Klant Koppeling */}
            <div className="mb-3 bg-gray-50 p-2 rounded border">
              <label className="text-xs font-bold text-gray-600 block mb-1">Gekoppelde Klant (voor punten):</label>
              {selectedCustomer ? (
                <div className="flex justify-between items-center text-sm">
                  <span className="font-semibold text-black">{selectedCustomer.first_name} {selectedCustomer.last_name}</span>
                  <button onClick={() => setSelectedCustomer(null)} className="text-red-500 text-xs underline">Ontkoppel</button>
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    placeholder="Zoek klant op naam/email..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="w-full p-1 text-sm border rounded mb-1"
                  />
                  {customerSearch && (
                    <div className="max-h-24 overflow-y-auto bg-white border rounded">
                      {filteredCustomers.slice(0, 5).map((c) => (
                        <div
                          key={c.id}
                          onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); }}
                          className="p-1 text-xs hover:bg-gray-100 cursor-pointer"
                        >
                          {c.first_name} {c.last_name} ({c.email})
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Winkelmand items */}
            <div className="overflow-y-auto max-h-48 mb-3 divide-y">
              {cart.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">Geen artikelen in winkelmand</p>
              ) : (
                cart.map((item) => (
                  <div key={item.id} className="py-2 flex justify-between items-center text-sm">
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-gray-500">€{item.price} x {item.quantity}</div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button onClick={() => updateQuantity(item.id, -1)} className="px-2 bg-gray-200 rounded font-bold">-</button>
                      <span>{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.id, 1)} className="px-2 bg-gray-200 rounded font-bold">+</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Kortingen & Punten Inwisselen */}
            <div className="border-t pt-2 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-semibold">Korting / Voucher:</span>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value)}
                  className="border p-1 rounded"
                >
                  <option value="none">Geen</option>
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Vast Bedrag (€)</option>
                </select>
              </div>

              {discountType !== 'none' && (
                <input
                  type="number"
                  placeholder={discountType === 'percentage' ? 'Voer % in' : 'Voer bedrag in'}
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="w-full p-1 border rounded"
                />
              )}

              {/* Punten inwisselen (vanaf 1 punt, 100 punten = €5) */}
              <div className="bg-gray-50 p-2 rounded border">
                <span className="font-semibold block mb-1">Punten Inwisselen (100 pnt = €5):</span>
                <div className="flex space-x-2">
                  <input
                    type="number"
                    min="0"
                    placeholder="Aantal punten"
                    value={pointsToRedeem}
                    onChange={(e) => setPointsToRedeem(e.target.value)}
                    className="flex-1 p-1 border rounded text-xs"
                  />
                  <button
                    onClick={handleRedeemPoints}
                    className="bg-black text-white px-3 py-1 rounded text-xs font-semibold"
                  >
                    Wissel
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Totalen en Checkout */}
          <div className="border-t pt-3 mt-2">
            <div className="flex justify-between text-sm mb-1">
              <span>Subtotaal:</span>
              <span>€{subtotal.toFixed(2)}</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-sm text-red-600 mb-1">
                <span>Korting:</span>
                <span>-€{totalDiscount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold mb-3">
              <span>Totaal:</span>
              <span>€{finalTotal.toFixed(2)}</span>
            </div>

            {selectedCustomer && (
              <div className="text-xs text-green-600 mb-2 font-medium">
                ✨ Deze bestelling levert {Math.floor(finalTotal)} punten op voor {selectedCustomer.first_name}.
              </div>
            )}

            {checkoutStatus && (
              <div className={`p-2 rounded text-xs mb-2 ${checkoutStatus.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {checkoutStatus.message}
              </div>
            )}

            <button
              onClick={handleCheckout}
              disabled={loading || cart.length === 0}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-bold py-3 rounded transition text-sm uppercase tracking-wider"
            >
              {loading ? 'Bezig met afrekenen...' : 'Afrekenen (Pin Handmatig)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}