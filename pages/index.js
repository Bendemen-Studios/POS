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
  const [paymentMethod, setPaymentMethod] = useState('sumup');
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Korting & Punten state
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState('fixed');
  
  // Klant & WooCommerce Points state
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [redeemPoints, setRedeemPoints] = useState(false);
  
  // Modals state
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ firstName: '', lastName: '', email: '', phone: '' });

  // Open Bedrag Modal state
  const [showOpenPriceModal, setShowOpenPriceModal] = useState(false);
  const [openPriceProduct, setOpenPriceProduct] = useState(null);
  const [customPriceInput, setCustomPriceInput] = useState('');

  // Variatie Modal state
  const [showVariationModal, setShowVariationModal] = useState(false);
  const [selectedVariableProduct, setSelectedVariableProduct] = useState(null);
  const [selectedAttributes, setSelectedAttributes] = useState({});

  const { data: productsData, mutate: mutateProducts } = useSWR('/api/woocommerce/products', fetcher, { 
    revalidateOnFocus: false,
    revalidateIfStale: false 
  });
  const products = productsData?.products || [];

  useEffect(() => {
    setMounted(true);
    const rawUser = localStorage.getItem('pos_user');
    if (!rawUser) {
      router.push('/login');
      return;
    }
    try {
      setUser(JSON.parse(rawUser));
    } catch (e) {
      router.push('/login');
      return;
    }

    const rawStore = localStorage.getItem('selectedStore');
    if (rawStore) {
      setStore(JSON.parse(rawStore));
    } else {
      router.push('/select-store');
    }
  }, [router]);

  if (!mounted) return null;

  const handleSyncProducts = async () => {
    try {
      setIsSyncing(true);
      const res = await axios.post('/api/woocommerce/sync-products');
      if (res.data.success) {
        alert('Producten succesvol gesynchroniseerd!');
        mutateProducts();
      } else {
        alert('Fout bij synchroniseren van producten.');
      }
    } catch (err) {
      alert('Fout bij communicatie met server tijdens sync.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleProductClick = (product) => {
    // 1. Check of het een variabel product is en variaties heeft
    if (product.type === 'variable' && product.variations && product.variations.length > 0) {
      setSelectedVariableProduct(product);
      setSelectedAttributes({});
      setShowVariationModal(true);
      return;
    }

    // 2. Check of het een open bedrag product is (prijs 0 of leeg)
    const priceNum = parseFloat(product.price);
    if (isNaN(priceNum) || priceNum === 0) {
      setOpenPriceProduct(product);
      setCustomPriceInput('');
      setShowOpenPriceModal(true);
      return;
    }

    // 3. Standaard product direct toevoegen
    addToCart({ ...product, price: priceNum, cartItemId: product.id });
  };

  const handleAddOpenPriceToCart = () => {
    const price = parseFloat(customPriceInput);
    if (isNaN(price) || price <= 0) {
      alert('Vul een geldig bedrag in.');
      return;
    }
    addToCart({ 
      ...openPriceProduct, 
      price: price, 
      name: `${openPriceProduct.name} (Open Bedrag)`,
      cartItemId: `${openPriceProduct.id}_${Date.now()}`
    });
    setShowOpenPriceModal(false);
    setOpenPriceProduct(null);
  };

  const handleAddVariationToCart = () => {
    // Zoek de juiste variatie op basis van geselecteerde attributen
    const matchedVariation = selectedVariableProduct.variations.find(v => {
      return Object.entries(selectedAttributes).every(([key, val]) => {
        return v.attributes.some(attr => attr.name.toLowerCase() === key.toLowerCase() && attr.option === val);
      });
    }) || selectedVariableProduct.variations[0]; // Fallback naar eerste variatie indien niet exact gematcht

    const varPrice = parseFloat(matchedVariation.price || selectedVariableProduct.price);
    const varName = `${selectedVariableProduct.name} - ${Object.values(selectedAttributes).join(', ')}`;

    addToCart({
      id: selectedVariableProduct.id,
      variation_id: matchedVariation.id,
      name: varName,
      price: varPrice,
      cartItemId: `${selectedVariableProduct.id}_var_${matchedVariation.id}`
    });

    setShowVariationModal(false);
    setSelectedVariableProduct(null);
  };

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.cartItemId === product.cartItemId);
      if (existing) {
        return prev.map((item) => item.cartItemId === product.cartItemId ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (cartItemId) => {
    setCart((prev) => prev.filter((item) => item.cartItemId !== cartItemId));
  };

  const subtotal = cart.reduce((sum, item) => sum + (parseFloat(item.price || 0) * item.quantity), 0);
  
  let discountAmount = discountType === 'percentage' ? (subtotal * (parseFloat(discount || 0) / 100)) : parseFloat(discount || 0);
  let pointsDiscount = (redeemPoints && selectedCustomer?.points) ? selectedCustomer.points * 0.05 : 0;
  const totalPrice = Math.max(0, subtotal - discountAmount - pointsDiscount);

  const handleSearchCustomer = async () => {
    if (!customerSearch) return;
    try {
      const res = await axios.get(`/api/woocommerce/customers?search=${customerSearch}`);
      if (res.data.success && res.data.customers?.length > 0) {
        setSelectedCustomer(res.data.customers[0]);
      } else {
        alert('Geen klant gevonden. Maak hieronder een nieuwe klant aan.');
      }
    } catch (err) {
      alert('Fout bij zoeken naar klant.');
    }
  };

  const handleCreateCustomer = async () => {
    if (!newCustomer.email || !newCustomer.firstName) {
        alert('Vul minimaal voornaam en e-mailadres in.');
        return;
    }
    try {
      const res = await axios.post('/api/woocommerce/customers', newCustomer);
      if (res.data.success) {
        setSelectedCustomer(res.data.customer);
        setShowNewCustomerModal(false);
        setNewCustomer({ firstName: '', lastName: '', email: '', phone: '' });
        alert('Klant succesvol aangemaakt en gekoppeld!');
      } else {
        alert('Fout bij aanmaken klant.');
      }
    } catch (err) {
      alert('Fout bij communicatie met server.');
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      alert('Winkelmand is leeg.');
      return;
    }
    try {
      if (paymentMethod === 'sumup') {
        const sumupRes = await axios.post('/api/sumup/checkout', {
          total: totalPrice,
          storeId: store?.id
        });
        if (!sumupRes.data.success) {
          alert('SumUp betaling mislukt.');
          return;
        }
      }

      const res = await axios.post('/api/woocommerce/create-order', {
        storeId: store?.id,
        items: cart,
        subtotal: subtotal,
        discount: discountAmount + pointsDiscount,
        total: totalPrice,
        paymentMethod: paymentMethod,
        customerId: selectedCustomer?.id || null,
        redeemPoints: redeemPoints,
        pointsToRedeem: redeemPoints ? selectedCustomer?.points : 0
      });

      if (res.data.success) {
        alert(`Bestelling succesvol geplaatst via ${paymentMethod === 'sumup' ? 'SumUp Pin' : 'Contant'}!`);
        setCart([]);
        setDiscount(0);
        setSelectedCustomer(null);
        setRedeemPoints(false);
      } else {
        alert('Fout bij plaatsen bestelling in WooCommerce.');
      }
    } catch (err) {
      alert('Fout bij communicatie met server.');
    }
  };

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ background: '#FFFFFF', color: '#111111', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', padding: '20px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Top Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FAFAFA', padding: '15px 25px', borderRadius: '12px', border: '1px solid #EAEAEA', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ background: '#000', color: '#FFF', padding: '8px 12px', fontWeight: '900', borderRadius: '6px', fontSize: '16px' }}>BDM</div>
            <div>
              <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>BENDEMEN POS</h1>
              <span style={{ fontSize: '13px', color: '#666' }}>Winkel: <strong>{store?.name || 'Ons Winkeltje'}</strong></span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button 
              onClick={handleSyncProducts} 
              disabled={isSyncing}
              style={{ padding: '10px 16px', background: '#F1F3F4', color: '#333', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}
            >
              {isSyncing ? 'Bezig met sync...' : '🔄 Sync Producten'}
            </button>
            {user?.role === 'administrator' && (
              <button onClick={() => router.push('/admin')} style={{ padding: '10px 16px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>Admin Paneel</button>
            )}
            <button onClick={() => { localStorage.removeItem('selectedStore'); router.push('/select-store'); }} style={{ padding: '10px 16px', background: '#F1F3F4', color: '#333', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>Winkel Wisselen</button>
          </div>
        </div>

        {/* Register Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '20px' }}>
          {/* Products Section */}
          <div style={{ background: '#FAFAFA', padding: '20px', borderRadius: '12px', border: '1px solid #EAEAEA', height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column' }}>
            <input 
              type="text" 
              placeholder="Zoek producten..." 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              style={{ width: '100%', padding: '12px', border: '1px solid #DDD', borderRadius: '8px', marginBottom: '15px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }} 
            />
            <div style={{ overflowY: 'auto', flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '15px', alignContent: 'flex-start' }}>
              {filteredProducts.map((p) => (
                <div key={p.id} onClick={() => handleProductClick(p)} style={{ background: '#fff', border: '1px solid #EAEAEA', borderRadius: '8px', padding: '15px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '10px' }}>{p.name}</div>
                  <div style={{ fontWeight: '700', fontSize: '15px', color: '#C3110C' }}>
                    {parseFloat(p.price) > 0 ? `€${p.price}` : 'Open Bedrag'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cart & Checkout Section */}
          <div style={{ background: '#FAFAFA', padding: '20px', borderRadius: '12px', border: '1px solid #EAEAEA', height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflowY: 'auto' }}>
            <div>
              <h3 style={{ marginTop: 0, fontSize: '18px', fontWeight: '800', marginBottom: '15px' }}>Winkelmand</h3>
              <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '15px' }}>
                {cart.length === 0 ? (
                  <p style={{ color: '#666', fontSize: '14px' }}>Winkelmand is leeg.</p>
                ) : (
                  cart.map((item) => (
                    <div key={item.cartItemId} style={{ background: '#fff', padding: '10px 15px', borderRadius: '8px', border: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '13px' }}>{item.name}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>{item.quantity}x €{item.price}</div>
                      </div>
                      <button onClick={() => removeFromCart(item.cartItemId)} style={{ background: '#FCE8E6', color: '#C3110C', border: 'none', borderRadius: '4px', padding: '5px 8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>✕</button>
                    </div>
                  ))
                )}
              </div>

              {/* Klant & Punten Sectie */}
              <div style={{ marginBottom: '12px', background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #EAEAEA' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', color: '#555' }}>Klant koppelen / Punten</label>
                {selectedCustomer ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                    <div>
                      <strong>{selectedCustomer.firstName} {selectedCustomer.lastName}</strong>
                      <div style={{ fontSize: '11px', color: '#666' }}>Punten: {selectedCustomer.points || 0}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={redeemPoints} onChange={(e) => setRedeemPoints(e.target.checked)} />
                        Inwisselen
                      </label>
                      <button onClick={() => setSelectedCustomer(null)} style={{ background: 'none', border: 'none', color: '#C3110C', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <input 
                        type="text" 
                        placeholder="Naam of e-mail klant..." 
                        value={customerSearch} 
                        onChange={(e) => setCustomerSearch(e.target.value)} 
                        style={{ flex: 1, padding: '8px', border: '1px solid #DDD', borderRadius: '6px', fontSize: '13px', outline: 'none' }} 
                      />
                      <button onClick={handleSearchCustomer} style={{ padding: '8px 12px', background: '#333', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>Zoek</button>
                    </div>
                    <button onClick={() => setShowNewCustomerModal(true)} style={{ width: '100%', padding: '6px', background: '#F1F3F4', color: '#333', border: '1px dashed #CCC', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>+ Nieuwe Klant Aanmaken</button>
                  </div>
                )}
              </div>

              {/* Korting Sectie */}
              <div style={{ marginBottom: '12px', background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #EAEAEA' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', color: '#555' }}>Korting toepassen</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input 
                    type="number" 
                    placeholder="Bedrag / %" 
                    value={discount} 
                    onChange={(e) => setDiscount(e.target.value)} 
                    style={{ flex: 1, padding: '8px', border: '1px solid #DDD', borderRadius: '6px', fontSize: '13px', outline: 'none' }} 
                  />
                  <select 
                    value={discountType} 
                    onChange={(e) => setDiscountType(e.target.value)} 
                    style={{ padding: '8px', border: '1px solid #DDD', borderRadius: '6px', fontSize: '13px', background: '#fff' }}
                  >
                    <option value="fixed">€</option>
                    <option value="percentage">%</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', marginBottom: '6px', textTransform: 'uppercase', color: '#555' }}>Betaalmethode</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <button 
                    onClick={() => setPaymentMethod('sumup')} 
                    style={{ padding: '10px', background: paymentMethod === 'sumup' ? '#000' : '#FFF', color: paymentMethod === 'sumup' ? '#FFF' : '#333', border: '1px solid #DDD', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}
                  >
                    SumUp Pin
                  </button>
                  <button 
                    onClick={() => setPaymentMethod('cash')} 
                    style={{ padding: '10px', background: paymentMethod === 'cash' ? '#000' : '#FFF', color: paymentMethod === 'cash' ? '#FFF' : '#333', border: '1px solid #DDD', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}
                  >
                    Contant
                  </button>
                </div>
              </div>

              <div style={{ borderTop: '1px solid #EAEAEA', paddingTop: '12px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '800' }}>
                <span>Totaal:</span>
                <span>€{totalPrice.toFixed(2)}</span>
              </div>
              <button onClick={handleCheckout} style={{ width: '100%', padding: '14px', background: '#C3110C', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '15px', cursor: 'pointer' }}>Afrekenen</button>
            </div>
          </div>
        </div>

        {/* Modal voor Open Bedrag */}
        {showOpenPriceModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: '25px', borderRadius: '12px', width: '350px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '10px', fontSize: '18px', fontWeight: '800' }}>Open Bedrag Invoeren</h3>
              <p style={{ fontSize: '13px', color: '#666', marginBottom: '15px' }}>{openPriceProduct?.name}</p>
              <input 
                type="number" 
                step="0.01" 
                placeholder="Bedrag in €" 
                value={customPriceInput} 
                onChange={(e) => setCustomPriceInput(e.target.value)} 
                style={{ width: '100%', padding: '10px', border: '1px solid #DDD', borderRadius: '6px', fontSize: '15px', marginBottom: '20px', boxSizing: 'border-box', outline: 'none' }} 
                autoFocus
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleAddOpenPriceToCart} style={{ flex: 1, padding: '10px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>Toevoegen</button>
                <button onClick={() => setShowOpenPriceModal(false)} style={{ padding: '10px 15px', background: '#F1F3F4', color: '#333', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>Annuleren</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal voor Product Variaties */}
        {showVariationModal && selectedVariableProduct && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: '25px', borderRadius: '12px', width: '400px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '10px', fontSize: '18px', fontWeight: '800' }}>Selecteer Opties</h3>
              <p style={{ fontSize: '13px', color: '#666', marginBottom: '15px' }}>{selectedVariableProduct.name}</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '20px' }}>
                {selectedVariableProduct.attributes?.map((attr) => (
                  <div key={attr.name}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', marginBottom: '5px', textTransform: 'uppercase', color: '#555' }}>{attr.name}</label>
                    <select 
                      value={selectedAttributes[attr.name] || ''}
                      onChange={(e) => setSelectedAttributes({ ...selectedAttributes, [attr.name]: e.target.value })}
                      style={{ width: '100%', padding: '10px', border: '1px solid #DDD', borderRadius: '6px', fontSize: '13px', background: '#fff', outline: 'none' }}
                    >
                      <option value="">Kies {attr.name}...</option>
                      {attr.options?.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleAddVariationToCart} style={{ flex: 1, padding: '10px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>Toevoegen aan Mand</button>
                <button onClick={() => setShowVariationModal(false)} style={{ padding: '10px 15px', background: '#F1F3F4', color: '#333', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>Annuleren</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal voor Nieuwe Klant */}
        {showNewCustomerModal && (
          <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div style={{ background: '#fff', padding: '25px', borderRadius: '12px', width: '400px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '18px', fontWeight: '800' }}>Nieuwe Klant Aanmaken</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                <input 
                  type="text" 
                  placeholder="Voornaam" 
                  value={newCustomer.firstName} 
                  onChange={(e) => setNewCustomer({ ...newCustomer, firstName: e.target.value })} 
                  style={{ padding: '10px', border: '1px solid #DDD', borderRadius: '6px', fontSize: '13px', outline: 'none' }} 
                />
                <input 
                  type="text" 
                  placeholder="Achternaam" 
                  value={newCustomer.lastName} 
                  onChange={(e) => setNewCustomer({ ...newCustomer, lastName: e.target.value })} 
                  style={{ padding: '10px', border: '1px solid #DDD', borderRadius: '6px', fontSize: '13px', outline: 'none' }} 
                />
                <input 
                  type="email" 
                  placeholder="E-mailadres" 
                  value={newCustomer.email} 
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} 
                  style={{ padding: '10px', border: '1px solid #DDD', borderRadius: '6px', fontSize: '13px', outline: 'none' }} 
                />
                <input 
                  type="text" 
                  placeholder="Telefoonnummer (optioneel)" 
                  value={newCustomer.phone} 
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} 
                  style={{ padding: '10px', border: '1px solid #DDD', borderRadius: '6px', fontSize: '13px', outline: 'none' }} 
                />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleCreateCustomer} style={{ flex: 1, padding: '10px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>Opslaan & Koppelen</button>
                <button onClick={() => setShowNewCustomerModal(false)} style={{ padding: '10px 15px', background: '#F1F3F4', color: '#333', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>Annuleren</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}