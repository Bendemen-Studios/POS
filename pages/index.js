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
  
  const [showOpenPriceModal, setShowOpenPriceModal] = useState(false);
  const [openPriceProduct, setOpenPriceProduct] = useState(null);
  const [customPriceInput, setCustomPriceInput] = useState('');

  const [showVariationModal, setShowVariationModal] = useState(false);
  const [selectedVariableProduct, setSelectedVariableProduct] = useState(null);
  const [selectedAttributes, setSelectedAttributes] = useState({});

  const { data: productsData, mutate: mutateProducts } = useSWR('/api/woocommerce/products', fetcher, { revalidateOnFocus: false });
  
  // Vang alle mogelijke datastructuren op (of het nu een array is of een object met .products)
  const products = Array.isArray(productsData) ? productsData : (productsData?.products || []);

  useEffect(() => {
    setMounted(true);
    setUser(JSON.parse(localStorage.getItem('pos_user') || 'null'));
    setStore(JSON.parse(localStorage.getItem('selectedStore') || 'null'));
  }, []);

  if (!mounted) return null;

  const categories = [...new Set(products.map(p => (p.categories && p.categories.length > 0) ? p.categories[0].name : 'Algemeen'))].sort();

  const handleSyncProducts = async () => {
    setIsSyncing(true);
    await axios.post('/api/woocommerce/sync-products');
    mutateProducts();
    setIsSyncing(false);
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
        alert('Bestelling succesvol geplaatst!');
        setCart([]); setSelectedCustomer(null);
      }
    } catch (err) { alert('Fout bij afrekenen.'); }
  };

  const filteredProducts = products.filter(p => {
    const pCat = (p.categories && p.categories.length > 0) ? p.categories[0].name : 'Algemeen';
    return (selectedCategory === 'Alle' || pCat === selectedCategory) && p.name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div style={{ padding: '20px', background: '#FFF', minHeight: '100vh', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h1 style={{ margin: 0, fontSize: '22px' }}>BENDEMEN POS</h1>
            <button onClick={handleSyncProducts} style={{ padding: '8px 14px', background: '#F1F3F4', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
              {isSyncing ? 'Bezig met sync...' : '🔄 Sync Producten'}
            </button>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '20px' }}>
            <div style={{ background: '#FAFAFA', padding: '20px', borderRadius: '12px', border: '1px solid #EAEAEA' }}>
                <input 
                  placeholder="Zoek producten..." 
                  onChange={(e) => setSearch(e.target.value)} 
                  style={{ width: '100%', padding: '10px', marginBottom: '12px', border: '1px solid #DDD', borderRadius: '6px', boxSizing: 'border-box', outline: 'none' }} 
                />
                
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

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '10px', maxHeight: 'calc(100vh - 250px)', overflowY: 'auto' }}>
                    {filteredProducts.length === 0 ? (
                      <p style={{ color: '#666', fontSize: '13px', gridColumn: '1 / -1' }}>Geen producten gevonden. Klik op 'Sync Producten' als de lijst leeg is.</p>
                    ) : (
                      filteredProducts.map(p => (
                        <div 
                          key={p.id} 
                          onClick={() => handleProductClick(p)} 
                          style={{ background: '#fff', border: '1px solid #EAEAEA', borderRadius: '8px', padding: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                        >
                            <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: '8px' }}>{p.name}</div>
                            <div style={{ fontWeight: '700', fontSize: '14px', color: '#C3110C' }}>{parseFloat(p.price) > 0 ? `€${p.price}` : 'Open Bedrag'}</div>
                        </div>
                      ))
                    )}
                </div>
            </div>
            
            <div style={{ background: '#FAFAFA', padding: '20px', borderRadius: '12px', border: '1px solid #EAEAEA', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                    <h3 style={{ marginTop: 0, marginBottom: '15px', fontSize: '16px', fontWeight: '800' }}>Winkelmand</h3>
                    <div style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {cart.length === 0 ? (
                          <p style={{ color: '#666', fontSize: '13px' }}>Winkelmand is leeg.</p>
                        ) : (
                          cart.map(i => (
                            <div key={i.cartItemId} style={{ background: '#fff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontWeight: '600', fontSize: '12px' }}>{i.name}</div>
                                    <div style={{ fontSize: '11px', color: '#666' }}>{i.quantity}x €{i.price}</div>
                                </div>
                                <button onClick={() => removeFromCart(i.cartItemId)} style={{ background: '#FCE8E6', color: '#C3110C', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>✕</button>
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
                    <button onClick={handleCheckout} style={{ width: '100%', background: '#C3110C', color: 'white', border: 'none', borderRadius: '8px', padding: '12px', fontWeight: '700', fontSize: '14px', cursor: 'pointer' }}>Afrekenen</button>
                </div>
            </div>
        </div>
    </div>
  );
}