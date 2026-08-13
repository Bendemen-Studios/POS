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
  const products = productsData?.products || [];

  useEffect(() => {
    setMounted(true);
    setUser(JSON.parse(localStorage.getItem('pos_user') || 'null'));
    setStore(JSON.parse(localStorage.getItem('selectedStore') || 'null'));
  }, []);

  if (!mounted) return null;

  const handleSyncProducts = async () => {
    setIsSyncing(true);
    await axios.post('/api/woocommerce/sync-products');
    mutateProducts();
    setIsSyncing(false);
  };

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.cartItemId === product.cartItemId);
      return existing ? prev.map(i => i.cartItemId === product.cartItemId ? {...i, quantity: i.quantity + 1} : i) : [...prev, {...product, quantity: 1}];
    });
  };

  const handleCheckout = async () => {
    const subtotal = cart.reduce((sum, i) => sum + (parseFloat(i.price) * i.quantity), 0);
    const discountAmount = discountType === 'percentage' ? (subtotal * (discount / 100)) : parseFloat(discount);
    const pointsDiscount = (redeemPoints && selectedCustomer) ? selectedCustomer.points * 0.05 : 0;
    const totalPaid = Math.max(0, subtotal - discountAmount - pointsDiscount);

    try {
      const res = await axios.post('/api/woocommerce/order', {
        orderItems: cart,
        paymentMethod,
        storeId: store?.id,
        cashierId: user?.id,
        customerId: selectedCustomer?.id || 0,
        totals: { discountAmount, pointsDiscount, pointsUsed: redeemPoints ? (selectedCustomer?.points || 0) : 0, totalPaid }
      });
      if (res.data.success) {
        alert('Bestelling succesvol!');
        setCart([]);
      }
    } catch (err) { alert('Fout bij afrekenen.'); }
  };

  // ... (Overige modal handlers: handleProductClick, handleAddOpenPriceToCart, etc. uit vorige stappen)

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
        {/* Hier je volledige UI layout zoals eerder opgebouwd */}
        <button onClick={handleSyncProducts}>Sync Producten</button>
        {/* ... rest van de UI ... */}
    </div>
  );
}