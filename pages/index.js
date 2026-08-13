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
    if (cart.length === 0) return alert('Mand is leeg');
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
        alert('Bestelling succesvol!');
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FAFAFA', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
            <h1 style={{ margin: 0, fontSize: '20px' }}>BENDEMEN POS - {store?.name}</h1>
            <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={handleSyncProducts}>{isSyncing ? 'Syncing...' : '🔄 Sync'}</button>
                {user?.role === 'administrator' && <button onClick={() => router.push('/admin')}>Admin Paneel</button>}
                <button onClick={() => { localStorage.removeItem('selectedStore'); router.push('/select-store'); }}>Winkel Wisselen</button>
            </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '20px' }}>
            <div style={{ background: '#FAFAFA', padding: '20px', borderRadius: '12px' }}>
                <input placeholder="Zoek producten..." onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px' }} />
                <div style={{ display: 'flex', gap: '5px', overflowX: 'auto', marginBottom: '10px' }}>
                    <button onClick={() => setSelectedCategory('Alle')}>Alle</button>
                    {categories.map(cat => <button key={cat} onClick={() => setSelectedCategory(cat)}>{cat}</button>)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    {filteredProducts.map(p => <div key={p.id} onClick={() => handleProductClick(p)} style={{ border: '1px solid #ccc', padding: '10px', cursor: 'pointer' }}>{p.name}</div>)}
                </div>
            </div>
            
            <div style={{ background: '#FAFAFA', padding: '20px', borderRadius: '12px' }}>
                <h3>Mand</h3>
                {cart.map(i => <div key={i.cartItemId}>{i.name} x {i.quantity} <button onClick={() => removeFromCart(i.cartItemId)}>X</button></div>)}
                <div style={{ marginTop: '20px', fontWeight: 'bold' }}>Totaal: €{totalPrice.toFixed(2)}</div>
                <button onClick={handleCheckout} style={{ marginTop: '10px', background: 'red', color: 'white', padding: '10px' }}>Afrekenen</button>
            </div>
        </div>
    </div>
  );
}