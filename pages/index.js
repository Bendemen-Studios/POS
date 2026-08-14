import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function POSHome() {
  const router = useRouter();

  // Auth & Sessie
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);

  // Producten, Cart & Categorieën
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  // Modal States: Open Bedrag, Variaties & Custom Artikel
  const [selectedProductForVariations, setSelectedProductForVariations] = useState(null);
  const [openAmountProduct, setOpenAmountProduct] = useState(null);
  const [customPriceInput, setCustomPriceInput] = useState('');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customItem, setCustomItem] = useState({ name: '', price: '' });

  // Klanten & Punten
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [redeemedDiscount, setRedeemedDiscount] = useState(0);

  // Kortingen
  const [discountType, setDiscountType] = useState('none');
  const [discountValue, setDiscountValue] = useState(0);

  // Status & Sync
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState(null);

  // Betaling & Wisselgeld Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('sumup');
  const [cashGiven, setCashGiven] = useState('');

  useEffect(() => {
    const userStr = localStorage.getItem('pos_user');
    if (!userStr) {
      router.push('/login');
      return;
    }
    try {
      setCurrentUser(JSON.parse(userStr));
    } catch (e) {
      router.push('/login');
      return;
    }

    const storeStr = localStorage.getItem('selectedStore');
    if (storeStr) {
      try { setSelectedStore(JSON.parse(storeStr)); } catch (e) {}
    }

    handleSyncData();
  }, []);

  const handleSyncData = async () => {
    setIsSyncing(true);
    await Promise.all([fetchProducts(), fetchCustomers()]);
    setIsSyncing(false);
  };

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

  const handleLogout = () => {
    localStorage.removeItem('pos_user');
    localStorage.removeItem('pos_token');
    router.push('/login');
  };

  // Uitgesloten categorieën
  const EXCLUDED_CATEGORIES = ['Ophaal Geschikt', 'Externe Productie', 'Kids'];

  const getProductCategory = (product) => {
    if (product.categories && product.categories.length > 0) {
      const validCategory = product.categories.find(
        (cat) => !EXCLUDED_CATEGORIES.includes(cat.name)
      );
      if (validCategory) {
        return validCategory.name;
      }
    }
    return 'Overige';
  };

  const activeProducts = products.filter((p) => {
    if (!p.categories || p.categories.length === 0) return true;
    return p.categories.some((cat) => !EXCLUDED_CATEGORIES.includes(cat.name));
  });

  const categoriesList = Array.from(
    new Set(activeProducts.map((p) => getProductCategory(p)))
  );

  const handleProductClick = (product) => {
    if (product.variations && product.variations.length > 0) {
      setSelectedProductForVariations(product);
      return;
    }

    const pPrice = parseFloat(product.price || 0);
    // Als prijs exact 0 is (en niet gedefinieerd als vast bedrag), open open bedrag pop-up. 
    // Je kunt 0 euro artikelen ook direct toevoegen of via open bedrag op 0 zetten.
    if (product.price === '' || product.price === null || (pPrice === 0 && !product.is_fixed_zero)) {
      setOpenAmountProduct(product);
      setCustomPriceInput('');
      return;
    }

    addToCart(product, pPrice);
  };

  const handleConfirmOpenAmount = () => {
    const enteredPrice = parseFloat(customPriceInput);
    if (isNaN(enteredPrice) || enteredPrice < 0) {
      alert('Voer een geldig bedrag in (0 of hoger).');
      return;
    }

    addToCart(openAmountProduct, enteredPrice);
    setOpenAmountProduct(null);
    setCustomPriceInput('');
  };

  const handleAddCustomItem = () => {
    if (!customItem.name || customItem.price === '') {
      alert('Vul aub een naam en bedrag in.');
      return;
    }
    const price = parseFloat(customItem.price);
    if (isNaN(price) || price < 0) {
      alert('Voer een geldig bedrag in.');
      return;
    }

    addToCartCustom({
      id: `custom_${Date.now()}`,
      product_id: 0,
      variation_id: 0,
      name: customItem.name,
      price: price,
      quantity: 1
    });

    setCustomItem({ name: '', price: '' });
    setShowCustomModal(false);
  };

  const handleSelectVariation = (variation) => {
    const varPrice = parseFloat(variation.price || selectedProductForVariations.price || 0);
    const varName = `${selectedProductForVariations.name} - ${variation.attributes ? variation.attributes.map(a => a.option).join('/') : 'Variatie'}`;

    const cartItem = {
      ...selectedProductForVariations,
      id: `${selectedProductForVariations.id}_var_${variation.id}`,
      product_id: selectedProductForVariations.id,
      variation_id: variation.id,
      name: varName,
      price: varPrice
    };

    addToCartCustom(cartItem);
    setSelectedProductForVariations(null);
  };

  const addToCart = (product, overridePrice = null) => {
    const finalPrice = overridePrice !== null ? overridePrice : parseFloat(product.price || 0);
    
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, price: finalPrice, quantity: 1, product_id: product.id, variation_id: 0 }];
    });
  };

  const addToCartCustom = (cartItem) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === cartItem.id);
      if (existing) {
        return prev.map((item) =>
          item.id === cartItem.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...cartItem, quantity: 1 }];
    });
  };

  const updateQuantity = (id, delta) => {
    setCart((prev) =>
      prev
        .map((item) => (item.id === id ? { ...item, quantity: item.quantity + delta } : item))
        .filter((item) => item.quantity > 0)
    );
  };

  const subtotal = cart.reduce((acc, item) => acc + parseFloat(item.price || 0) * item.quantity, 0);

  let manualDiscountAmount = 0;
  if (discountType === 'percentage') {
    manualDiscountAmount = (subtotal * parseFloat(discountValue || 0)) / 100;
  } else if (discountType === 'fixed') {
    manualDiscountAmount = parseFloat(discountValue || 0);
  }

  const totalDiscount = Math.min(subtotal, manualDiscountAmount + parseFloat(redeemedDiscount || 0));
  const finalTotal = Math.max(0, subtotal - totalDiscount);

  const cashGivenFloat = parseFloat(cashGiven) || 0;
  const changeDue = Math.max(0, cashGivenFloat - finalTotal);

  const handleRedeemPoints = async () => {
    const pts = parseInt(pointsToRedeem) || 0;
    if (pts <= 0) {
      setRedeemedDiscount(0);
      return;
    }
    if (!selectedCustomer) {
      alert('Koppel eerst een klant voordat je punten kunt inwisselen.');
      return;
    }

    try {
      const res = await fetch('/api/woocommerce/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          pointsToRedeem: pts,
          action: 'redeem'
        })
      });
      const data = await res.json();
      if (data.success) {
        setRedeemedDiscount(data.discountAmount);
      } else {
        alert(data.message || 'Fout bij inwisselen punten.');
      }
    } catch (e) {
      const discount = pts * 0.05;
      setRedeemedDiscount(discount.toFixed(2));
    }
  };

  const handleOpenPaymentModal = () => {
    if (cart.length === 0) {
      alert('Winkelmand is leeg.');
      return;
    }
    setCashGiven(finalTotal.toFixed(2));
    setShowPaymentModal(true);
  };

  const handleProcessPayment = async () => {
    if (selectedPaymentMethod === 'cash' && cashGivenFloat < finalTotal) {
      alert('Het ingegeven contante bedrag is lager dan het totaalbedrag.');
      return;
    }

    setLoading(true);
    setCheckoutStatus(null);

    try {
      if (selectedPaymentMethod === 'sumup') {
        const sumupRes = await fetch('/api/sumup/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            totalAmount: finalTotal.toFixed(2),
            terminalId: localStorage.getItem('pos_fallback_terminal_id') || 'SOLO_READER_1'
          }),
        });
        const sumupData = await sumupRes.json();
        if (!sumupData.success) {
          throw new Error(sumupData.error || 'SumUp betaling kon niet worden gestart.');
        }

        await fetch('/api/woocommerce/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderItems: cart,
            paymentMethod: 'sumup',
            storeId: selectedStore?.id || 1,
            cashierId: currentUser?.id || 1,
            customerId: selectedCustomer ? selectedCustomer.id : 0,
            totals: {
              subtotal,
              discountAmount: manualDiscountAmount,
              pointsDiscount: parseFloat(redeemedDiscount || 0),
              pointsUsed: parseInt(pointsToRedeem || 0),
              totalPaid: finalTotal
            }
          }),
        });
      } else {
        const res = await fetch('/api/woocommerce/manual-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderItems: cart,
            paymentMethod: selectedPaymentMethod,
            storeId: selectedStore?.id || 1,
            cashierId: currentUser?.id || 1,
            customerId: selectedCustomer ? selectedCustomer.id : 0,
            totals: {
              subtotal,
              discountAmount: manualDiscountAmount,
              pointsDiscount: parseFloat(redeemedDiscount || 0),
              pointsUsed: parseInt(pointsToRedeem || 0),
              totalPaid: finalTotal
            },
            cashDetails: selectedPaymentMethod === 'cash' ? {
              cashGiven: cashGivenFloat.toFixed(2),
              changeDue: changeDue.toFixed(2)
            } : null
          }),
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Fout bij verwerken van de bestelling.');
      }

      const changeText = selectedPaymentMethod === 'cash' && changeDue > 0 ? ` (Wisselgeld: €${changeDue.toFixed(2)})` : '';
      setCheckoutStatus({ success: true, message: `Bestelling succesvol afgerond!${changeText}` });
      
      setShowPaymentModal(false);
      setCart([]);
      setSelectedCustomer(null);
      setPointsToRedeem(0);
      setRedeemedDiscount(0);
      setDiscountType('none');
      setDiscountValue(0);
      setCashGiven('');

    } catch (err) {
      console.error(err);
      alert(err.message || 'Fout tijdens afrekenen.');
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = activeProducts.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const pCat = getProductCategory(p);
    const matchesCategory = selectedCategory === 'ALL' || pCat === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredCustomers = customers.filter((c) =>
    `${c.first_name || ''} ${c.last_name || ''} ${c.email || ''}`.toLowerCase().includes(customerSearch.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-black text-white p-4 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-3">
          <span className="font-bold text-xl tracking-wider">BDM POS</span>
          {currentUser && (
            <span className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded">
              {currentUser.username} ({currentUser.role})
            </span>
          )}
          {selectedStore && (
            <span className="text-xs bg-red-700 text-white px-2 py-1 rounded font-bold">
              📍 {selectedStore.name}
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={handleSyncData}
            disabled={isSyncing}
            className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded text-xs font-semibold transition flex items-center space-x-1"
          >
            <span>{isSyncing ? '⏳ Syncing...' : '🔄 Sync'}</span>
          </button>

          <Link href="/admin">
            <button className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded text-xs font-semibold transition">
              ⚙️ Admin
            </button>
          </Link>

          <button
            onClick={handleLogout}
            className="bg-red-700 hover:bg-red-800 text-white px-3 py-2 rounded text-xs font-semibold transition"
          >
            🚪 Loguit
          </button>
        </div>
      </header>

      {/* Grid Layout */}
      <div className="flex-1 flex flex-col md:flex-row p-4 gap-4 overflow-hidden">
        
        {/* Producten & Categorieën Catalogus */}
        <div className="w-full md:w-3/5 flex flex-col bg-white rounded-lg shadow p-4">
          
          <div className="flex space-x-2 mb-3">
            <input
              type="text"
              placeholder="Zoek producten op naam..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-black text-sm"
            />
            <button
              onClick={() => setShowCustomModal(true)}
              className="bg-black hover:bg-gray-800 text-white font-bold px-3 py-2 rounded text-xs whitespace-nowrap transition"
            >
              + Custom Artikel
            </button>
          </div>

          {/* Categorie Tegels */}
          <div className="flex space-x-2 overflow-x-auto pb-3 mb-3 border-b">
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`px-4 py-2 rounded text-xs font-bold whitespace-nowrap transition ${
                selectedCategory === 'ALL'
                  ? 'bg-black text-white'
                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
              }`}
            >
              📦 Alle Producten ({activeProducts.length})
            </button>
            {categoriesList.map((cat) => {
              const count = activeProducts.filter((p) => getProductCategory(p) === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded text-xs font-bold whitespace-nowrap transition ${
                    selectedCategory === cat
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>

          {/* Producten Grid (1:1 foto ratio met aspect-square) */}
          <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[calc(100vh-280px)]">
            {filteredProducts.map((product) => {
              const imageUrl = product.images && product.images.length > 0 ? product.images[0].src : null;
              const hasVariations = product.variations && product.variations.length > 0;
              const isPriceZero = parseFloat(product.price || 0) === 0;

              return (
                <div
                  key={product.id}
                  onClick={() => handleProductClick(product)}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-2 flex flex-col justify-between cursor-pointer hover:border-black transition shadow-sm hover:shadow relative"
                >
                  {hasVariations && (
                    <span className="absolute top-2 right-2 bg-black text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase z-10">
                      Variaties
                    </span>
                  )}

                  <div>
                    {/* 1:1 Foto Container */}
                    <div className="w-full aspect-square bg-gray-200 rounded mb-2 overflow-hidden flex items-center justify-center">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-gray-400 text-xs font-bold">GEEN FOTO</span>
                      )}
                    </div>
                    <h3 className="font-semibold text-xs line-clamp-2">{product.name}</h3>
                  </div>

                  <div className="mt-2 flex justify-between items-center">
                    <span className="text-[10px] text-gray-500 font-bold uppercase truncate max-w-[80px]">
                      {getProductCategory(product)}
                    </span>
                    <span className="font-bold text-sm text-red-600">
                      {isPriceZero ? '€0.00 / Open' : `€${parseFloat(product.price || 0).toFixed(2)}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Winkelmand */}
        <div className="w-full md:w-2/5 flex flex-col bg-white rounded-lg shadow p-4 justify-between">
          <div>
            <h2 className="text-lg font-bold mb-3 border-b pb-2">Huidige Bestelling</h2>

            <div className="mb-3 bg-gray-50 p-2 rounded border">
              <label className="text-xs font-bold text-gray-600 block mb-1">Gekoppelde Klant (voor punten):</label>
              {selectedCustomer ? (
                <div className="flex justify-between items-center text-sm">
                  <span className="font-semibold text-black">{selectedCustomer.first_name} {selectedCustomer.last_name}</span>
                  <button onClick={() => { setSelectedCustomer(null); setPointsToRedeem(0); setRedeemedDiscount(0); }} className="text-red-500 text-xs underline">Ontkoppel</button>
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

            <div className="overflow-y-auto max-h-40 mb-3 divide-y">
              {cart.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">Geen artikelen in winkelmand</p>
              ) : (
                cart.map((item) => (
                  <div key={item.id} className="py-2 flex justify-between items-center text-sm">
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-gray-500">€{parseFloat(item.price).toFixed(2)} x {item.quantity}</div>
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
              onClick={handleOpenPaymentModal}
              disabled={loading || cart.length === 0}
              className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-bold py-3 rounded transition text-sm uppercase tracking-wider"
            >
              Afrekenen (€{finalTotal.toFixed(2)})
            </button>
          </div>
        </div>
      </div>

      {/* MODAL 1: OPEN BEDRAG */}
      {openAmountProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold mb-2">Invoeren Open Bedrag</h3>
            <p className="text-xs text-gray-600 mb-4">{openAmountProduct.name}</p>
            
            <div className="mb-4">
              <label className="text-xs font-bold text-gray-600 block mb-1">Prijs (€):</label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={customPriceInput}
                onChange={(e) => setCustomPriceInput(e.target.value)}
                className="w-full p-3 border-2 border-black rounded text-xl font-bold"
                autoFocus
              />
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() => setOpenAmountProduct(null)}
                className="w-1/2 bg-gray-200 text-black font-bold py-2 rounded text-xs"
              >
                Annuleren
              </button>
              <button
                onClick={handleConfirmOpenAmount}
                className="w-1/2 bg-red-600 text-white font-bold py-2 rounded text-xs"
              >
                Toevoegen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CUSTOM ARTIKEL */}
      {showCustomModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold mb-4">Custom Artikel Toevoegen</h3>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Artikelnaam</label>
                <input
                  type="text"
                  placeholder="Bijv. Handmatige service"
                  value={customItem.name}
                  onChange={(e) => setCustomItem({...customItem, name: e.target.value})}
                  className="w-full p-2 border rounded text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Bedrag (€)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={customItem.price}
                  onChange={(e) => setCustomItem({...customItem, price: e.target.value})}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>
            </div>
            <div className="flex space-x-2">
              <button onClick={() => setShowCustomModal(false)} className="w-1/2 bg-gray-200 py-2 rounded text-xs font-bold">Annuleren</button>
              <button onClick={handleAddCustomItem} className="w-1/2 bg-red-600 text-white py-2 rounded text-xs font-bold">Toevoegen</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: VARIATIES */}
      {selectedProductForVariations && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold mb-1">Kies Variatie</h3>
            <p className="text-xs text-gray-600 mb-4">{selectedProductForVariations.name}</p>

            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {selectedProductForVariations.variations_data && selectedProductForVariations.variations_data.length > 0 ? (
                selectedProductForVariations.variations_data.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => handleSelectVariation(v)}
                    className="w-full text-left p-3 border rounded hover:border-black flex justify-between items-center bg-gray-50 font-semibold text-xs"
                  >
                    <span>{v.attributes ? v.attributes.map(a => a.option).join(' / ') : `Variatie #${v.id}`}</span>
                    <span className="text-red-600 font-bold">€{parseFloat(v.price || selectedProductForVariations.price).toFixed(2)}</span>
                  </button>
                ))
              ) : (
                <p className="text-xs text-gray-500 py-2">Geen gedetailleerde variaties geladen.</p>
              )}
            </div>

            <button
              onClick={() => setSelectedProductForVariations(null)}
              className="w-full bg-gray-200 text-black font-bold py-2 rounded text-xs"
            >
              Sluiten
            </button>
          </div>
        </div>
      )}

      {/* MODAL 4: BETAALMETHODE & WISSELGELD */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold mb-4 border-b pb-2">Kies Betaalmethode</h3>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <button
                onClick={() => setSelectedPaymentMethod('sumup')}
                className={`p-3 text-xs font-bold border rounded transition ${selectedPaymentMethod === 'sumup' ? 'bg-black text-white' : 'bg-gray-100 text-black'}`}
              >
                💳 SumUp
              </button>
              <button
                onClick={() => setSelectedPaymentMethod('manual_pin')}
                className={`p-3 text-xs font-bold border rounded transition ${selectedPaymentMethod === 'manual_pin' ? 'bg-black text-white' : 'bg-gray-100 text-black'}`}
              >
                📌 Handmatige Pin
              </button>
              <button
                onClick={() => setSelectedPaymentMethod('cash')}
                className={`p-3 text-xs font-bold border rounded transition ${selectedPaymentMethod === 'cash' ? 'bg-black text-white' : 'bg-gray-100 text-black'}`}
              >
                💵 Contant
              </button>
            </div>

            {selectedPaymentMethod === 'cash' && (
              <div className="bg-gray-50 p-4 rounded border mb-4 space-y-3">
                <div className="flex justify-between items-center text-sm font-bold">
                  <span>Te Betalen:</span>
                  <span className="text-red-600 font-extrabold text-base">€{finalTotal.toFixed(2)}</span>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">Ontvangen Bedrag (€):</label>
                  <input
                    type="number"
                    step="0.01"
                    value={cashGiven}
                    onChange={(e) => setCashGiven(e.target.value)}
                    className="w-full p-2 border border-black rounded text-lg font-bold"
                  />
                </div>

                <div className="grid grid-cols-4 gap-1">
                  {[finalTotal, 5, 10, 20, 50, 100].map((amt, idx) => (
                    amt >= finalTotal && (
                      <button
                        key={idx}
                        onClick={() => setCashGiven(amt.toFixed(2))}
                        className="bg-white border hover:bg-gray-100 text-xs font-bold py-1.5 rounded"
                      >
                        €{amt.toFixed(2)}
                      </button>
                    )
                  ))}
                </div>

                <div className="bg-black text-white p-3 rounded flex justify-between items-center mt-2">
                  <span className="text-xs font-bold uppercase">Teruggeven Wisselgeld:</span>
                  <span className="text-xl font-black text-green-400">€{changeDue.toFixed(2)}</span>
                </div>
              </div>
            )}

            {(selectedPaymentMethod === 'cash' || selectedPaymentMethod === 'manual_pin') && (
              <div className="text-xs text-gray-500 mb-4 bg-blue-50 p-2 rounded text-blue-800">
                ℹ️ Handmatige Pin en Contant betalingen vereisen géén bon.
              </div>
            )}

            <div className="flex space-x-2">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="w-1/3 bg-gray-200 hover:bg-gray-300 text-black font-bold py-3 rounded text-xs uppercase"
              >
                Annuleren
              </button>
              <button
                onClick={handleProcessPayment}
                disabled={loading}
                className="w-2/3 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded text-xs uppercase transition tracking-wider"
              >
                {loading ? 'Verwerken...' : 'Betaling Voltooien'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}