import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function POS() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('Alle');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [amountGiven, setAmountGiven] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [store, setStore] = useState({ name: 'Bendemen POS' });
  const router = useRouter();

  useEffect(() => {
    const savedStore = localStorage.getItem('selectedStore');
    if (!savedStore) {
      router.push('/select-store');
      return;
    }
    try { 
      setStore(JSON.parse(savedStore)); 
    } catch (e) {
      router.push('/select-store');
    }
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/woocommerce/products');
      const data = await res.json();
      if (data.success) {
        setProducts(data.products || []);
      } else {
        setErrorMsg('Fout bij ophalen: ' + (data.error || 'Onbekende fout'));
      }
    } catch (err) {
      setErrorMsg('Kan geen verbinding maken met WooCommerce API.');
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (item, variation = null) => {
    const cartItem = {
      uniqueId: variation ? `${item.id}-${variation.id}` : `${item.id}-single`,
      id: item.id,
      product_id: item.id,
      variation_id: variation ? variation.id : 0,
      name: variation ? `${item.name} (${variation.name})` : item.name,
      price: variation ? variation.price : item.price,
      sku: variation ? variation.sku : item.sku,
      image: variation?.image || item.image
    };
    setCart([...cart, cartItem]);
  };

  const removeFromCart = (index) => {
    const newCart = [...cart];
    newCart.splice(index, 1);
    setCart(newCart);
  };

  const cartTotal = cart.reduce((sum, item) => sum + parseFloat(item.price), 0);
  const categories = ['Alle', ...new Set(products.map(p => p.categoryName || 'Overig'))];
  const filteredProducts = selectedCategory === 'Alle' 
    ? products 
    : products.filter(p => (p.categoryName || 'Overig') === selectedCategory);

  const handleCheckout = async () => {
    const given = parseFloat(amountGiven);
    if (isNaN(given) || given < cartTotal) return;

    const change = given - cartTotal;

    try {
      setLoading(true);
      const res = await fetch('/api/woocommerce/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart: cart,
          total: cartTotal,
          amountGiven: given,
          change: change,
          storeName: store?.name
        })
      });

      const data = await res.json();

      if (data.success) {
        setPaymentSuccess(true);
        setTimeout(() => {
          setCart([]);
          setAmountGiven('');
          setPaymentSuccess(false);
        }, 2500);
      } else {
        alert('Fout bij opslaan bestelling in WooCommerce: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Netwerkfout bij afrekenen.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/login');
  };

  return (
    <div style={{ background: '#FFFFFF', color: '#111111', minHeight: '100vh', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px 30px', borderBottom: '1px solid #EAEAEA', background: '#FFFFFF', position: 'sticky', top: 0, zIndex: 10 }}>
        
        {/* Links: Logo & Titel */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ background: '#000', color: '#FFF', padding: '6px 10px', fontWeight: '900', borderRadius: '4px', fontSize: '16px' }}>BDM</div>
          <h1 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>BENDEMEN POS</h1>
        </div>

        {/* Midden: Geselecteerde Winkel */}
        <div style={{ background: '#FAFAFA', padding: '6px 16px', borderRadius: '20px', border: '1px solid #EAEAEA', fontSize: '13px', fontWeight: '700', color: '#C3110C' }}>
          📍 {store.name}
        </div>

        {/* Rechts: Actie knoppen */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            onClick={() => router.push('/admin')}
            style={{ padding: '8px 16px', background: '#F0F0F0', color: '#333', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}
          >
            ⚙️ Admin
          </button>
          <button 
            onClick={fetchProducts} 
            disabled={loading}
            style={{ padding: '8px 16px', background: '#000', color: '#FFFFFF', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}
          >
            {loading ? 'Bezig...' : '🔄 Sync'}
          </button>
          <button 
            onClick={() => router.push('/select-store')}
            style={{ padding: '8px 12px', background: '#FFF', border: '1px solid #DDD', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
            title="Winkel wisselen"
          >
            🏪
          </button>
          <button 
            onClick={handleLogout}
            style={{ padding: '8px 12px', background: '#C3110C', color: '#FFFFFF', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}
            title="Uitloggen"
          >
            🚪 Uitloggen
          </button>
        </div>
      </header>

      {errorMsg && (
        <div style={{ margin: '15px 30px', padding: '12px', background: '#FCE8E6', color: '#C3110C', borderRadius: '8px', border: '1px solid #FAD2D1', fontWeight: '500', fontSize: '13px' }}>
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Kassa Layout */}
      <div style={{ display: 'flex', height: 'calc(100vh - 65px)' }}>
        
        {/* Linkerkant: Producten */}
        <div style={{ flex: 2.5, padding: '30px', overflowY: 'auto', borderRight: '1px solid #EAEAEA' }}>
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: '25px', overflowX: 'auto', paddingBottom: '5px' }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '20px',
                  border: selectedCategory === cat ? 'none' : '1px solid #DDDDDD',
                  background: selectedCategory === cat ? '#C3110C' : '#FFFFFF',
                  color: selectedCategory === cat ? '#FFFFFF' : '#333333',
                  fontWeight: '600',
                  fontSize: '13px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '15px' }}>
            {filteredProducts.map(p => (
              <div 
                key={p.id} 
                style={{ 
                  background: '#FAFAFA', 
                  border: '1px solid #EBEBEB', 
                  borderRadius: '10px', 
                  padding: '15px', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  {p.image ? (
                    <img src={p.image} alt={p.name} style={{ width: '100%', height: '110px', objectFit: 'cover', borderRadius: '6px', marginBottom: '10px', background: '#EEE' }} />
                  ) : (
                    <div style={{ width: '100%', height: '110px', background: '#EEE', borderRadius: '6px', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#AAA', fontSize: '11px' }}>Geen foto</div>
                  )}
                  <h3 style={{ fontSize: '13px', fontWeight: '600', margin: '0 0 5px 0', color: '#111', lineHeight: '1.3' }}>{p.name}</h3>
                  <span style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '10px' }}>€{parseFloat(p.price).toFixed(2)}</span>
                </div>

                {p.type === 'variable' && p.variations && p.variations.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#C3110C' }}>Optie:</span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', maxHeight: '70px', overflowY: 'auto' }}>
                      {p.variations.map(v => (
                        <button
                          key={v.id}
                          onClick={() => addToCart(p, v)}
                          style={{ padding: '3px 6px', fontSize: '11px', background: '#FFF', border: '1px solid #CCC', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          {v.name} (€{v.price})
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={() => addToCart(p)} 
                    style={{ width: '100%', padding: '9px', background: '#000', color: '#FFFFFF', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', marginTop: '10px' }}
                  >
                    + Toevoegen
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Rechterkant: Mandje */}
        <div style={{ flex: 1, background: '#FAFAFA', padding: '25px', display: 'flex', flexDirection: 'column', borderLeft: '1px solid #EAEAEA', minWidth: '340px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '800', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Winkelmand</span>
            <span style={{ background: '#000', color: '#FFF', fontSize: '12px', padding: '2px 8px', borderRadius: '10px' }}>{cart.length}</span>
          </h2>

          <div style={{ flex: 1, overflowY: 'auto', marginBottom: '15px' }}>
            {cart.length === 0 ? (
              <p style={{ color: '#888', textAlign: 'center', marginTop: '50px', fontSize: '13px' }}>Je mandje is leeg.</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {cart.map((item, idx) => (
                  <li key={idx} style={{ background: '#FFFFFF', padding: '10px 12px', borderRadius: '8px', border: '1px solid #EBEBEB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ paddingRight: '10px' }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', display: 'block', color: '#111' }}>{item.name}</span>
                      <span style={{ fontSize: '11px', color: '#C3110C', fontWeight: '700' }}>€{parseFloat(item.price).toFixed(2)}</span>
                    </div>
                    <button onClick={() => removeFromCart(idx)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: '16px' }}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={{ borderTop: '1px solid #EAEAEA', paddingTop: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', fontSize: '16px', fontWeight: '800' }}>
              <span>Totaal:</span>
              <span style={{ color: '#C3110C' }}>€{cartTotal.toFixed(2)}</span>
            </div>

            {paymentSuccess ? (
              <div style={{ padding: '15px', background: '#E6F4EA', color: '#137333', borderRadius: '8px', fontWeight: '700', textAlign: 'center', fontSize: '14px' }}>
                ✅ Bestelling geplaatst & betaald!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Bedrag ontvangen (€)"
                  value={amountGiven}
                  onChange={(e) => setAmountGiven(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #DDD', fontSize: '14px', boxSizing: 'border-box' }}
                />
                {amountGiven !== '' && (
                  <div style={{ fontSize: '13px', fontWeight: '700', color: parseFloat(amountGiven) >= cartTotal ? '#137333' : '#C3110C' }}>
                    {parseFloat(amountGiven) >= cartTotal 
                      ? `Wisselgeld: € ${(parseFloat(amountGiven) - cartTotal).toFixed(2)}`
                      : `Tekort: € ${(cartTotal - parseFloat(amountGiven)).toFixed(2)}`
                    }
                  </div>
                )}
                <button 
                  onClick={handleCheckout} 
                  disabled={cart.length === 0 || parseFloat(amountGiven || 0) < cartTotal || loading} 
                  style={{ 
                    padding: '12px', 
                    background: (cart.length === 0 || parseFloat(amountGiven || 0) < cartTotal || loading) ? '#CCCCCC' : '#C3110C', 
                    color: '#FFFFFF', 
                    border: 'none', 
                    borderRadius: '8px', 
                    width: '100%', 
                    cursor: 'pointer', 
                    fontWeight: '700', 
                    fontSize: '14px'
                  }}
                >
                  {loading ? 'Bezig met verwerken...' : 'Afrekenen & Bestelling Plaatsen'}
                </button>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}