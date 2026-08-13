import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import axios from 'axios';

const fetcher = (url) => axios.get(url).then((res) => res.data);

export default function CashRegister() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [store, setStore] = useState(null);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState('');

  const { data: productsData } = useSWR('/api/woocommerce/products', fetcher, { revalidateOnFocus: false });
  const products = productsData?.products || [];

  useEffect(() => {
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

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (id) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const totalPrice = cart.reduce((sum, item) => sum + (parseFloat(item.price || 0) * item.quantity), 0);

  const handleCheckout = async () => {
    if (cart.length === 0) {
      alert('Winkelmand is leeg.');
      return;
    }
    try {
      const res = await axios.post('/api/woocommerce/create-order', {
        storeId: store?.id,
        items: cart,
        total: totalPrice
      });
      if (res.data.success) {
        alert('Bestelling succesvol geplaatst!');
        setCart([]);
      } else {
        alert('Fout bij plaatsen bestelling.');
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
              <span style={{ fontSize: '13px', color: '#666' }}>Winkel: <strong>{store?.name || 'Laden...'}</strong></span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
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
                <div key={p.id} onClick={() => addToCart(p)} style={{ background: '#fff', border: '1px solid #EAEAEA', borderRadius: '8px', padding: '15px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '10px' }}>{p.name}</div>
                  <div style={{ fontWeight: '700', fontSize: '15px', color: '#C3110C' }}>€{p.price}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Cart Section */}
          <div style={{ background: '#FAFAFA', padding: '20px', borderRadius: '12px', border: '1px solid #EAEAEA', height: 'calc(100vh - 140px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ marginTop: 0, fontSize: '18px', fontWeight: '800', marginBottom: '15px' }}>Winkelmand</h3>
              <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 320px)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {cart.length === 0 ? (
                  <p style={{ color: '#666', fontSize: '14px' }}>Winkelmand is leeg.</p>
                ) : (
                  cart.map((item) => (
                    <div key={item.id} style={{ background: '#fff', padding: '10px 15px', borderRadius: '8px', border: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '13px' }}>{item.name}</div>
                        <div style={{ fontSize: '12px', color: '#666' }}>{item.quantity}x €{item.price}</div>
                      </div>
                      <button onClick={() => removeFromCart(item.id)} style={{ background: '#FCE8E6', color: '#C3110C', border: 'none', borderRadius: '4px', padding: '5px 8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>✕</button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <div style={{ borderTop: '1px solid #EAEAEA', paddingTop: '15px', marginBottom: '15px', display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '800' }}>
                <span>Totaal:</span>
                <span>€{totalPrice.toFixed(2)}</span>
              </div>
              <button onClick={handleCheckout} style={{ width: '100%', padding: '14px', background: '#C3110C', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '15px', cursor: 'pointer' }}>Afrekenen</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}