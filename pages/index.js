import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import axios from 'axios';

const fetcher = (url) => axios.get(url).then((res) => res.data);

export default function CashRegister() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState(null);
  const [store, setStore] = useState(null);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('Alle');
  
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState('fixed');
  
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [redeemPoints, setRedeemPoints] = useState(false);

  // Modals
  const [showOpenPriceModal, setShowOpenPriceModal] = useState(false);
  const [openPriceProduct, setOpenPriceProduct] = useState(null);
  const [customPriceInput, setCustomPriceInput] = useState('');

  const [showVariationModal, setShowVariationModal] = useState(false);
  const [selectedVariableProduct, setSelectedVariableProduct] = useState(null);
  const [selectedAttributes, setSelectedAttributes] = useState({});

  // Checkout Modal State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('sumup'); 
  const [cashGiven, setCashGiven] = useState('');
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);

  // Producten ophalen via SWR
  const { data: productsData, mutate: mutateProducts } = useSWR('/api/woocommerce/products', fetcher, { revalidateOnFocus: false });
  const products = Array.isArray(productsData) ? productsData : (productsData?.products || []);

  useEffect(() => {
    setMounted(true);
    try {
      const rawUser = localStorage.getItem('pos_user');
      if (rawUser && rawUser !== 'undefined') setUser(JSON.parse(rawUser));
    } catch (e) { console.error('Fout bij parsen pos_user:', e); }

    try {
      const rawStore = localStorage.getItem('selectedStore');
      if (rawStore && rawStore !== 'undefined') setStore(JSON.parse(rawStore));
    } catch (e) { console.error('Fout bij parsen selectedStore:', e); }
  }, []);

  if (!mounted) return null;

  const isAdminOrManager = user?.role === 'administrator' || user?.role === 'manager' || user?.role === 'shop_manager';

  const categories = [...new Set(products.map(p => (p.categories && p.categories.length > 0) ? p.categories[0].name : 'Algemeen'))].sort();

  const handleSyncProducts = async () => {
    try {
      setIsSyncing(true);
      await mutateProducts();
      alert('Producten succesvol ververst!');
    } catch (err) {
      alert('Fout bij synchroniseren van producten.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleProductClick = (product) => {
    // 1. Variabel product check
    if (product.type === 'variable' && product.attributes?.length > 0) {
      setSelectedVariableProduct(product);
      const initAttrs = {};
      product.attributes.forEach(attr => {
        if (attr.options && attr.options.length > 0) initAttrs[attr.name] = attr.options[0];
      });
      setSelectedAttributes(initAttrs);
      setShowVariationModal(true);
      return;
    }

    // 2. Open Bedrag check (prijs is leeg/null)
    if (product.price === "" || product.price === null || product.price === undefined) {
      setOpenPriceProduct(product);
      setCustomPriceInput('');
      setShowOpenPriceModal(true);
      return;
    }

    const priceNum = parseFloat(product.price);
    
    // 3. Als prijs expliciet 0 is, mag deze ook als open bedrag of rechtstreeks aangeslagen worden
    if (isNaN(priceNum)) {
      setOpenPriceProduct(product);
      setCustomPriceInput('0.00');
      setShowOpenPriceModal(true);
      return;
    }

    addToCart({ ...product, price: priceNum, cartItemId: product.id, isOpenPrice: false });
  };

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.cartItemId === product.cartItemId);
      return existing ? prev.map(i => i.cartItemId === product.cartItemId ? {...i, quantity: i.quantity + 1} : i) : [...prev, {...product, quantity: 1}];
    });
  };

  // Bevestigen van Open Bedrag (NU OOK €0.00 TOEGESTAAN)
  const handleConfirmOpenPrice = () => {
    const rawVal = customPriceInput.replace(',', '.');
    const parsedPrice = parseFloat(rawVal);

    if (isNaN(parsedPrice)) {
      return alert('Voer een geldig bedrag in.');
    }

    addToCart({
      ...openPriceProduct,
      name: `${openPriceProduct.name} (${parsedPrice === 0 ? '€0.00' : 'Vrij bedrag'})`,
      price: parsedPrice,
      cartItemId: `${openPriceProduct.id}-custom-${Date.now()}`,
      isOpenPrice: true
    });
    setShowOpenPriceModal(false);
  };

  const handleConfirmVariation = () => {
    const attrString = Object.values(selectedAttributes).join(' / ');
    addToCart({
      ...selectedVariableProduct,
      name: `${selectedVariableProduct.name} (${attrString})`,
      price: parseFloat(selectedVariableProduct.price) || 0,
      cartItemId: `${selectedVariableProduct.id}-var-${attrString}`,
      selectedAttributes
    });
    setShowVariationModal(false);
  };

  const removeFromCart = (cartItemId) => setCart(prev => prev.filter(i => i.cartItemId !== cartItemId));

  const subtotal = cart.reduce((sum, i) => sum + (parseFloat(i.price) * i.quantity), 0);
  const discountAmount = discountType === 'percentage' ? (subtotal * (discount / 100)) : parseFloat(discount || 0);
  const pointsDiscount = (redeemPoints && selectedCustomer) ? (selectedCustomer.points || 0) * 0.05 : 0;
  const totalPrice = Math.max(0, subtotal - discountAmount - pointsDiscount);

  const parsedCashGiven = parseFloat(cashGiven.replace(',', '.')) || 0;
  const changeAmount = Math.max(0, parsedCashGiven - totalPrice);

  const openCheckoutModal = () => {
    if (cart.length === 0) return alert('Winkelmand is leeg.');
    setCashGiven('');
    setPaymentMethod('sumup');
    setShowCheckoutModal(true);
  };

  const handleFinalCheckout = async () => {
    if (paymentMethod === 'cash' && parsedCashGiven < totalPrice) {
      return alert('Het ontvangen contante bedrag is lager dan het totaalbedrag!');
    }

    try {
      setIsProcessingCheckout(true);
      const res = await axios.post('/api/woocommerce/order', {
        orderItems: cart,
        paymentMethod,
        storeId: store?.id,
        cashierId: user?.id,
        customerId: selectedCustomer?.id || 0,
        totals: { 
          discountAmount, 
          pointsDiscount, 
          pointsUsed: redeemPoints ? (selectedCustomer?.points || 0) : 0, 
          totalPaid: totalPrice,
          cashGiven: paymentMethod === 'cash' ? parsedCashGiven : totalPrice,
          changeAmount: paymentMethod === 'cash' ? changeAmount : 0
        }
      });

      if (res.data.success) {
        alert(`Bestelling #${res.data.orderId} succesvol afgerond!${paymentMethod === 'cash' ? `\nWisselgeld: €${changeAmount.toFixed(2)}` : ''}`);
        setCart([]);
        setSelectedCustomer(null);
        setRedeemPoints(false);
        setShowCheckoutModal(false);
        mutateProducts(); // Ververs voorraadlijst na bestelling
      } else {
        alert('Fout bij plaatsen bestelling.');
      }
    } catch (err) {
      alert('Fout bij communicatie met server.');
    } finally {
      setIsProcessingCheckout(false);
    }
  };

  const filteredProducts = products.filter(p => {
    const pCat = (p.categories && p.categories.length > 0) ? p.categories[0].name : 'Algemeen';
    return (selectedCategory === 'Alle' || pCat === selectedCategory) && p.name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div style={{ background: '#FFFFFF', color: '#111111', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '20px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FAFAFA', padding: '15px 25px', borderRadius: '12px', border: '1px solid #EAEAEA', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ background: '#000', color: '#FFF', padding: '8px 12px', fontWeight: '900', borderRadius: '6px', fontSize: '16px' }}>BDM</div>
            <div>
              <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>BENDEMEN POS</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                <span style={{ height: '8px', width: '8px', borderRadius: '50%', background: '#137333', display: 'inline-block' }}></span>
                <span style={{ fontSize: '13px', color: '#555' }}>
                  Actieve winkel: <strong style={{ color: '#000' }}>{store?.name || 'Ons Winkeltje'}</strong>
                </span>
              </div>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button onClick={handleSyncProducts} disabled={isSyncing} style={{ padding: '8px 14px', background: '#F1F3F4', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
              {isSyncing ? 'Bezig...' : '🔄 Sync'}
            </button>

            {isAdminOrManager && (
              <button 
                onClick={() => router.push('/admin')} 
                style={{ padding: '8px 14px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                ⚙️ Admin Paneel
              </button>
            )}

            <button onClick={() => { localStorage.removeItem('selectedStore'); router.push('/select-store'); }} style={{ padding: '8px 14px', background: '#F1F3F4', color: '#333', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
              Winkel Wisselen
            </button>
          </div>
        </div>

        {/* Layout Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '20px' }}>
          
          {/* Producten Grid */}
          <div style={{ background: '#FAFAFA', padding: '20px', borderRadius: '12px', border: '1px solid #EAEAEA', height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column' }}>
            <input type="text" placeholder="Zoek producten..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #DDD', borderRadius: '8px', marginBottom: '12px', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />

            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '15px', paddingBottom: '4px' }}>
              <button onClick={() => setSelectedCategory('Alle')} style={{ padding: '6px 12px', background: selectedCategory === 'Alle' ? '#000' : '#FFF', color: selectedCategory === 'Alle' ? '#FFF' : '#333', border: '1px solid #DDD', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>Alle</button>
              {categories.map(cat => (
                <button key={cat} onClick={() => setSelectedCategory(cat)} style={{ padding: '6px 12px', background: selectedCategory === cat ? '#000' : '#FFF', color: selectedCategory === cat ? '#FFF' : '#333', border: '1px solid #DDD', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}>{cat}</button>
              ))}
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px', alignContent: 'flex-start' }}>
              {filteredProducts.map((p) => {
                const hasStockManagement = p.manage_stock === true || p.stock_quantity !== null;
                const stockQty = p.stock_quantity !== null ? p.stock_quantity : 0;
                
                return (
                  <div key={p.id} onClick={() => handleProductClick(p)} style={{ background: '#fff', border: '1px solid #EAEAEA', borderRadius: '8px', padding: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
                    
                    {/* Voorraad Indicator Badge */}
                    {hasStockManagement && (
                      <span style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        fontSize: '10px',
                        fontWeight: '800',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: stockQty > 0 ? '#E6F4EA' : '#FCE8E6',
                        color: stockQty > 0 ? '#137333' : '#C3110C'
                      }}>
                        {stockQty} op voorraad
                      </span>
                    )}

                    <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '12px', paddingRight: hasStockManagement ? '60px' : '0' }}>
                      {p.name}
                    </div>
                    
                    <div style={{ fontWeight: '700', fontSize: '14px', color: '#C3110C' }}>
                      {p.type === 'variable' ? 'Kies opties' : (p.price !== "" && p.price !== null && !isNaN(parseFloat(p.price)) ? `€${parseFloat(p.price).toFixed(2)}` : 'Open Bedrag')}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Winkelmand */}
          <div style={{ background: '#FAFAFA', padding: '20px', borderRadius: '12px', border: '1px solid #EAEAEA', height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ marginTop: 0, fontSize: '16px', fontWeight: '800', marginBottom: '15px' }}>Winkelmand</h3>
              <div style={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {cart.length === 0 ? <p style={{ color: '#666', fontSize: '13px' }}>Winkelmand is leeg.</p> : cart.map((item) => (
                  <div key={item.cartItemId} style={{ background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '12px' }}>{item.name}</div>
                      <div style={{ fontSize: '11px', color: '#666' }}>{item.quantity}x €{item.price.toFixed(2)}</div>
                    </div>
                    <button onClick={() => removeFromCart(item.cartItemId)} style={{ background: '#FCE8E6', color: '#C3110C', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ borderTop: '1px solid #EAEAEA', paddingTop: '12px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: '800' }}>
                <span>Totaal:</span>
                <span>€{totalPrice.toFixed(2)}</span>
              </div>
              <button onClick={openCheckoutModal} style={{ width: '100%', padding: '12px', background: '#C3110C', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>Afrekenen</button>
            </div>
          </div>

        </div>
      </div>

      {/* --- POP-UP MODAL: AFREKENEN & WISSELGELD --- */}
      {showCheckoutModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#FFF', padding: '25px', borderRadius: '12px', width: '450px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, fontSize: '20px', fontWeight: '800' }}>Afrekenen</h3>
            
            <div style={{ background: '#FAFAFA', padding: '12px', borderRadius: '8px', border: '1px solid #EAEAEA', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#666' }}>Te betalen bedrag:</span>
              <span style={{ fontSize: '22px', fontWeight: '900', color: '#C3110C' }}>€{totalPrice.toFixed(2)}</span>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '8px', color: '#333' }}>Betaalmethode Kies:</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                <button onClick={() => setPaymentMethod('sumup')} style={{ padding: '12px 8px', border: paymentMethod === 'sumup' ? '2px solid #000' : '1px solid #DDD', background: paymentMethod === 'sumup' ? '#000' : '#FFF', color: paymentMethod === 'sumup' ? '#FFF' : '#333', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '12px' }}>💳 PIN SumUp</button>
                <button onClick={() => setPaymentMethod('pin_manual')} style={{ padding: '12px 8px', border: paymentMethod === 'pin_manual' ? '2px solid #000' : '1px solid #DDD', background: paymentMethod === 'pin_manual' ? '#000' : '#FFF', color: paymentMethod === 'pin_manual' ? '#FFF' : '#333', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '12px' }}>📟 PIN Handmatig</button>
                <button onClick={() => setPaymentMethod('cash')} style={{ padding: '12px 8px', border: paymentMethod === 'cash' ? '2px solid #000' : '1px solid #DDD', background: paymentMethod === 'cash' ? '#000' : '#FFF', color: paymentMethod === 'cash' ? '#FFF' : '#333', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '12px' }}>💵 Contant</button>
              </div>
            </div>

            {paymentMethod === 'cash' && (
              <div style={{ background: '#FFF8F8', border: '1px solid #FCE8E6', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '6px', color: '#333' }}>Ontvangen Bedrag (€):</label>
                <input type="text" placeholder="0.00" value={cashGiven} onChange={(e) => setCashGiven(e.target.value)} autoFocus style={{ width: '100%', padding: '10px', fontSize: '18px', fontWeight: 'bold', border: '1px solid #DDD', borderRadius: '6px', boxSizing: 'border-box', marginBottom: '10px' }} />

                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                  {[5, 10, 20, 50].map((amt) => (
                    <button key={amt} onClick={() => setCashGiven(amt.toString())} style={{ flex: 1, padding: '6px', background: '#FFF', border: '1px solid #DDD', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}>€{amt}</button>
                  ))}
                  <button onClick={() => setCashGiven(totalPrice.toFixed(2))} style={{ flex: 1, padding: '6px', background: '#EAEAEA', border: '1px solid #CCC', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '700' }}>Gepast</button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px solid #FCE8E6' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#666' }}>Wisselgeld terug:</span>
                  <span style={{ fontSize: '18px', fontWeight: '900', color: parsedCashGiven >= totalPrice ? '#2E7D32' : '#C3110C' }}>
                    €{changeAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCheckoutModal(false)} disabled={isProcessingCheckout} style={{ padding: '12px 18px', background: '#F1F3F4', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>Annuleren</button>
              <button onClick={handleFinalCheckout} disabled={isProcessingCheckout} style={{ padding: '12px 20px', background: '#C3110C', color: '#FFF', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700' }}>
                {isProcessingCheckout ? 'Verwerken...' : 'Betaling Voltooien'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- POP-UP MODAL: OPEN BEDRAG (OOK €0.00 IS TOEGESTAAN) --- */}
      {showOpenPriceModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#FFF', padding: '25px', borderRadius: '12px', width: '350px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, fontSize: '18px', fontWeight: '800' }}>Open Bedrag Invoeren</h3>
            <p style={{ fontSize: '13px', color: '#666', marginTop: '-5px' }}>{openPriceProduct?.name}</p>
            <div style={{ margin: '20px 0' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '5px' }}>Bedrag (€)</label>
              <input type="text" placeholder="0.00" value={customPriceInput} onChange={(e) => setCustomPriceInput(e.target.value)} autoFocus style={{ width: '100%', padding: '12px', fontSize: '18px', fontWeight: 'bold', border: '1px solid #CCC', borderRadius: '6px', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowOpenPriceModal(false)} style={{ padding: '10px 15px', background: '#F1F3F4', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>Annuleren</button>
              <button onClick={handleConfirmOpenPrice} style={{ padding: '10px 15px', background: '#000', color: '#FFF', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>Toevoegen</button>
            </div>
          </div>
        </div>
      )}

      {/* --- POP-UP MODAL: VARIATIES --- */}
      {showVariationModal && selectedVariableProduct && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#FFF', padding: '25px', borderRadius: '12px', width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0, fontSize: '18px', fontWeight: '800' }}>Selecteer Opties</h3>
            <p style={{ fontSize: '13px', color: '#666', marginTop: '-5px' }}>{selectedVariableProduct.name}</p>
            <div style={{ margin: '20px 0', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {selectedVariableProduct.attributes?.map((attr) => (
                <div key={attr.id || attr.name}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '5px' }}>{attr.name}</label>
                  <select value={selectedAttributes[attr.name] || ''} onChange={(e) => setSelectedAttributes(prev => ({ ...prev, [attr.name]: e.target.value }))} style={{ width: '100%', padding: '10px', fontSize: '14px', border: '1px solid #CCC', borderRadius: '6px', background: '#FFF' }}>
                    {attr.options?.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowVariationModal(false)} style={{ padding: '10px 15px', background: '#F1F3F4', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>Annuleren</button>
              <button onClick={handleConfirmVariation} style={{ padding: '10px 15px', background: '#C3110C', color: '#FFF', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>In winkelmand</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}