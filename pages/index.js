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
  const [selectedCategory, setSelectedCategory] = useState('Alle');
  
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState('fixed');
  
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [redeemPoints, setRedeemPoints] = useState(false);

  // Modals
  const [showOpenPriceModal, setShowOpenPriceModal] = useState(false);
  const [openPriceProduct, setOpenPriceProduct] = useState(null);
  const [customPriceInput, setCustomPriceInput] = useState('');
  const [showVariationModal, setShowVariationModal] = useState(false);
  const [selectedVariableProduct, setSelectedVariableProduct] = useState(null);
  const [selectedAttributes, setSelectedAttributes] = useState({});

  const { data: productsData, mutate: mutateProducts } = useSWR('/api/woocommerce/products', fetcher, { revalidateOnFocus: false });
  const products = Array.isArray(productsData) ? productsData : (productsData?.products || []);

  useEffect(() => {
    setMounted(true);
    
    try {
      const rawUser = localStorage.getItem('pos_user');
      if (rawUser && rawUser !== 'undefined') {
        setUser(JSON.parse(rawUser));
      }
    } catch (e) {
      console.error('Fout bij parsen pos_user:', e);
    }

    try {
      const rawStore = localStorage.getItem('selectedStore');
      if (rawStore && rawStore !== 'undefined') {
        setStore(JSON.parse(rawStore));
      }
    } catch (e) {
      console.error('Fout bij parsen selectedStore:', e);
    }
  }, []);

  if (!mounted) return null;

  const categories = [...new Set(products.map(p => (p.categories && p.categories.length > 0) ? p.categories[0].name : 'Algemeen'))].sort();

  const handleSyncProducts = async () => {
    try {
      setIsSyncing(true);
      const res = await axios.post('/api/woocommerce/sync-products');
      if (res.data.success) {
        alert('Producten succesvol gesynchroniseerd!');
        mutateProducts();
      } else {
        alert('Fout bij synchroniseren.');
      }
    } catch (err) {
      alert('Fout bij communicatie met server.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleProductClick = (product) => {
    if (product.type === 'variable' && product.variations?.length > 0) {
      setSelectedVariableProduct(product);
      setSelectedAttributes({});
      setShowVariationModal(true);
      return;
    }
    const priceNum = parseFloat(product.price);
    if (isNaN(priceNum) || priceNum === 0) {
      setOpenPriceProduct(product);
      setCustomPriceInput('');
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

  const removeFromCart = (cartItemId) => setCart(prev => prev.filter(i => i.cartItemId !== cartItemId));

  const subtotal = cart.reduce((sum, i) => sum + (parseFloat(i.price) * i.quantity), 0);
  const discountAmount = discountType === 'percentage' ? (subtotal * (discount / 100)) : parseFloat(discount || 0);
  const pointsDiscount = (redeemPoints && selectedCustomer) ? (selectedCustomer.points || 0) * 0.05 : 0;
  const totalPrice = Math.max(0, subtotal - discountAmount - pointsDiscount);

  const handleCheckout = async () => {
    if (cart.length === 0) {
      alert('Winkelmand is leeg.');
      return;
    }
    try {
      const res = await axios.post('/api/woocommerce/order', {
        orderItems: cart,
        paymentMethod,
        storeId: store?.id,
        cashierId: user?.id,
        customerId: selectedCustomer?.id || 0,
        totals: { discountAmount, pointsDiscount, pointsUsed: redeemPoints ? (selectedCustomer?.points || 0) : 0, totalPaid: totalPrice }
      });
      if (res.data.success) {
        alert(`Bestelling #${res.data.orderId} succesvol geplaatst!`);
        setCart([]); 
        setSelectedCustomer(null);
        setRedeemPoints(false);
      } else {
        alert('Fout bij plaatsen bestelling.');
      }
    } catch (err) {
      alert('Fout bij communicatie met server.');
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
              <span style={{ fontSize: '13px', color: '#666' }}>Winkel: <strong>{store?.name || 'Ons Winkeltje'}</strong></span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button 
              onClick={handleSyncProducts} 
              disabled={isSyncing}
              style={{ padding: '8px 14px', background: '#F1F3F4', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}
            >
              {isSyncing ? 'Bezig...' : '🔄 Sync'}
            </button>
            {user?.role === 'administrator' && (
              <button onClick={() => router.push('/admin')} style={{ padding: '8px 14px', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
                Admin Paneel
              </button>
            )}
            <button onClick={() => { localStorage.removeItem('selectedStore'); router.push('/select-store'); }} style={{ padding: '8px 14px', background: '#F1F3F4', color: '#333', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
              Winkel Wisselen
            </button>
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
              style={{ width: '100%', padding: '10px', border: '1px solid #DDD', borderRadius: '8px', marginBottom: '12px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }} 
            />

            {/* Categorie Menu */}
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '15px', paddingBottom: '4px' }}>
              <button 
                onClick={() => setSelectedCategory('Alle')}
                style={{ padding: '6px 12px', background: selectedCategory === 'Alle' ? '#000' : '#FFF', color: selectedCategory === 'Alle' ? '#FFF' : '#333', border: '1px solid #DDD', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}
              >
                Alle
              </button>
              {categories.map(cat => (
                <button 
                  key={cat} 
                  onClick={() => setSelectedCategory(cat)}
                  style={{ padding: '6px 12px', background: selectedCategory === cat ? '#000' : '#FFF', color: selectedCategory === cat ? '#FFF' : '#333', border: '1px solid #DDD', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap' }}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', alignContent: 'flex-start' }}>
              {filteredProducts.length === 0 ? (
                <p style={{ color: '#666', fontSize: '13px', gridColumn: '1 / -1' }}>Geen producten gevonden. Klik op 'Sync' als de lijst leeg is.</p>
              ) : (
                filteredProducts.map((p) => (
                  <div 
                    key={p.id} 
                    onClick={() => handleProductClick(p)} 
                    style={{ background: '#fff', border: '1px solid #EAEAEA', borderRadius: '8px', padding: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                  >
                    <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '8px' }}>{p.name}</div>
                    <div style={{ fontWeight: '700', fontSize: '14px', color: '#C3110C' }}>
                      {parseFloat(p.price) > 0 ? `€${p.price}` : 'Open Bedrag'}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Cart & Checkout Section */}
          <div style={{ background: '#FAFAFA', padding: '20px', borderRadius: '12px', border: '1px solid #EAEAEA', height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflowY: 'auto' }}>
            <div>
              <h3 style={{ marginTop: 0, fontSize: '16px', fontWeight: '800', marginBottom: '15px' }}>Winkelmand</h3>
              <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px' }}>
                {cart.length === 0 ? (
                  <p style={{ color: '#666', fontSize: '13px' }}>Winkelmand is leeg.</p>
                ) : (
                  cart.map((item) => (
                    <div key={item.cartItemId} style={{ background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '12px' }}>{item.name}</div>
                        <div style={{ fontSize: '11px', color: '#666' }}>{item.quantity}x €{item.price}</div>
                      </div>
                      <button onClick={() => removeFromCart(item.cartItemId)} style={{ background: '#FCE8E6', color: '#C3110C', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>✕</button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <div style={{ borderTop: '1px solid #EAEAEA', paddingTop: '12px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: '800' }}>
                <span>Totaal:</span>
                <span>€{totalPrice.toFixed(2)}</span>
              </div>
              <button onClick={handleCheckout} style={{ width: '100%', padding: '12px', background: '#C3110C', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>Afrekenen</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}