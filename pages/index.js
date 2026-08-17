import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function POSHome() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [allStores, setAllStores] = useState([]);
  
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pos_active_tab') || 'pos';
    }
    return 'pos';
  });
  
  const [isChecking, setIsChecking] = useState(true);

  const [products, setProducts] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pos_cached_products');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [cart, setCart] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pos_cart');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  const [selectedProductForVariations, setSelectedProductForVariations] = useState(null);
  const [openAmountProduct, setOpenAmountProduct] = useState(null);
  const [customPriceInput, setCustomPriceInput] = useState('');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customItem, setCustomItem] = useState({ name: '', price: '' });
  const [showStoreModal, setShowStoreModal] = useState(false);

  const [completedOrderForReceipt, setCompletedOrderForReceipt] = useState(null);
  const [stockWarningModal, setStockWarningModal] = useState({ show: false, product: null, variation: null, price: 0 });

  const [customers, setCustomers] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pos_cached_customers');
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  
  const [selectedCustomer, setSelectedCustomer] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pos_selected_customer');
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });

  const [customerSearch, setCustomerSearch] = useState('');
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [redeemedDiscount, setRedeemedDiscount] = useState(0);

  const [discountType, setDiscountType] = useState('none');
  const [discountValue, setDiscountValue] = useState(0);

  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState(null);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('sumup');
  const [cashGiven, setCashGiven] = useState('');

  const [pickupOrders, setPickupOrders] = useState([]);
  const [loadingPickup, setLoadingPickup] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && products.length > 0) {
      localStorage.setItem('pos_cached_products', JSON.stringify(products));
    }
  }, [products]);

  useEffect(() => {
    if (typeof window !== 'undefined' && customers.length > 0) {
      localStorage.setItem('pos_cached_customers', JSON.stringify(customers));
    }
  }, [customers]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pos_cart', JSON.stringify(cart));
    }
  }, [cart]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (selectedCustomer) {
        localStorage.setItem('pos_selected_customer', JSON.stringify(selectedCustomer));
      } else {
        localStorage.removeItem('pos_selected_customer');
      }
    }
  }, [selectedCustomer]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pos_active_tab', activeTab);
    }
  }, [activeTab]);

  const formatAttributes = (attributes) => {
    if (!attributes || !Array.isArray(attributes) || attributes.length === 0) return '';
    return attributes
      .map((a) => {
        const key = a.name || a.slug || 'Optie';
        const val = a.option || 'Standaard';
        return `${key}: ${val}`;
      })
      .join(' | ');
  };

  useEffect(() => {
    const userStr = localStorage.getItem('pos_user');
    if (!userStr) {
      router.replace('/login');
      return;
    }
    try {
      setCurrentUser(JSON.parse(userStr));
    } catch (e) {
      router.replace('/login');
      return;
    }

    const storeStr = localStorage.getItem('selectedStore') || localStorage.getItem('pos_selected_store');
    if (storeStr) {
      try { setSelectedStore(JSON.parse(storeStr)); } catch (e) {}
    } else {
      setShowStoreModal(true);
    }

    fetchStores();
    handleSyncData();
    fetchPickupOrders();
    checkOfflineQueue();
    setIsChecking(false);
  }, [router]);

  const triggerOfflineSync = async (isManualClick = false) => {
    const savedQueue = JSON.parse(localStorage.getItem('pos_offline_orders') || '[]');
    if (savedQueue.length === 0) {
      setPendingOfflineCount(0);
      if (isManualClick) alert('Er staan geen offline bestellingen in de wachtrij.');
      return;
    }

    setIsSyncing(true);
    let successCount = 0;
    const remainingQueue = [];
    let lastError = '';

    for (const order of savedQueue) {
      try {
        let res = await fetch('/api/woocommerce/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(order)
        });

        if (res.status === 404) {
          res = await fetch('/api/woocommerce/offline-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(order)
          });
        }

        const data = await res.json();

        if (res.ok && data.success) {
          successCount++;
        } else {
          lastError = data.error || data.message || `HTTP ${res.status}`;
          remainingQueue.push(order);
        }
      } catch (err) {
        lastError = err.message || 'Geen verbinding met de server';
        remainingQueue.push(order);
      }
    }

    localStorage.setItem('pos_offline_orders', JSON.stringify(remainingQueue));
    setPendingOfflineCount(remainingQueue.length);
    setIsSyncing(false);

    if (successCount > 0 && remainingQueue.length === 0) {
      alert(`✅ Alle ${successCount} offline bestelling(en) succesvol gesynchroniseerd!`);
      fetchProducts();
    } else if (remainingQueue.length > 0 && isManualClick) {
      const wantToClear = confirm(
        `⚠️ Synchroniseren van ${remainingQueue.length} offline bestelling(en) mislukt.\n\nFoutmelding van server:\n"${lastError}"\n\nWil je deze vastgelopen offline bestelling(en) WISSEN uit de kassa?`
      );
      if (wantToClear) {
        localStorage.removeItem('pos_offline_orders');
        setPendingOfflineCount(0);
        alert('Offline bestellingen gewist uit het geheugen.');
      }
    }
  };

  useEffect(() => {
    const handleOnlineEvent = () => triggerOfflineSync(false);
    window.addEventListener('online', handleOnlineEvent);
    const interval = setInterval(() => triggerOfflineSync(false), 30000);

    return () => {
      window.removeEventListener('online', handleOnlineEvent);
      clearInterval(interval);
    };
  }, []);

  const checkOfflineQueue = () => {
    const queue = JSON.parse(localStorage.getItem('pos_offline_orders') || '[]');
    setPendingOfflineCount(queue.length);
  };

  const fetchStores = async () => {
    try {
      const res = await fetch('/api/admin/store');
      const data = await res.json();
      if (data.success) {
        const storeList = Array.isArray(data.stores) ? data.stores : (data.store ? [data.store] : []);
        setAllStores(storeList);
        if (!localStorage.getItem('selectedStore') && storeList.length > 0) {
          handleSelectStore(storeList[0]);
        }
      }
    } catch (err) {
      console.error('Fout bij ophalen winkels:', err);
    }
  };

  const handleSelectStore = (store) => {
    const storeData = {
      id: store.id || store.store_id || 1,
      store_id: store.id || store.store_id || 1,
      name: store.store_name || store.name || 'Ons Winkeltje',
      store_name: store.store_name || store.name || 'Ons Winkeltje',
      location: store.address || store.location || '',
      address: store.address || store.location || '',
      pickup_id: store.pickup_id || null,
      terminal_id: store.terminal_id || null
    };

    setSelectedStore(storeData);
    localStorage.setItem('selectedStore', JSON.stringify(storeData));
    localStorage.setItem('pos_selected_store', JSON.stringify(storeData));
    setShowStoreModal(false);
  };

  const handleSyncData = async () => {
    setIsSyncing(true);
    await Promise.all([fetchProducts(), fetchCustomers(), fetchUsersAsCustomers(), fetchPickupOrders()]);
    await triggerOfflineSync(false);
    setIsSyncing(false);
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/woocommerce/products');
      const data = await res.json();
      if (data.success && data.products) {
        setProducts(data.products);
        localStorage.setItem('pos_cached_products', JSON.stringify(data.products));
      }
    } catch (err) {
      console.error('Fout bij ophalen producten:', err);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch('/api/woocommerce/customers');
      const data = await res.json();
      if (data.success && data.customers) {
        setCustomers(data.customers);
      }
    } catch (err) {
      console.error('Fout bij ophalen klanten:', err);
    }
  };

  const fetchUsersAsCustomers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (data.success && data.users) {
        const staffAsCustomers = data.users.map(u => ({
          id: `user_${u.id}`,
          first_name: u.username || '',
          last_name: u.role ? `(${u.role})` : '(Gebruiker)',
          email: u.email || `${u.username}@bendemen.local`
        }));
        
        setCustomers(prev => {
          const existingIds = new Set(prev.map(c => String(c.id)));
          const merged = [...prev, ...staffAsCustomers.filter(s => !existingIds.has(String(s.id)))];
          localStorage.setItem('pos_cached_customers', JSON.stringify(merged));
          return merged;
        });
      }
    } catch (err) {
      console.error('Fout bij ophalen gebruikers:', err);
    }
  };

  const fetchPickupOrders = async () => {
    try {
      setLoadingPickup(true);
      const res = await fetch('/api/woocommerce/pickup-orders');
      const data = await res.json();
      if (data.success) {
        setPickupOrders(data.orders || []);
      }
    } catch (err) {
      console.error('Fout bij ophalen afhaalbestellingen:', err);
    } finally {
      setLoadingPickup(false);
    }
  };

  const handleMarkAsPickedUp = async (orderId) => {
    if (!confirm(`Weet je zeker dat bestelling #${orderId} is opgehaald? De status wordt gewijzigd naar Voltooid.`)) return;
    try {
      const res = await fetch('/api/woocommerce/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, status: 'completed' })
      });
      const data = await res.json();
      if (data.success) {
        setPickupOrders(prev => prev.filter(o => o.id !== orderId));
        alert(`Bestelling #${orderId} succesvol gemarkeerd als opgehaald!`);
      } else {
        alert('Fout bij bijwerken status: ' + (data.error || 'Onbekende fout'));
      }
    } catch (err) {
      alert('Fout bij bijwerken status.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('pos_user');
    localStorage.removeItem('pos_token');
    localStorage.removeItem('pos_cart');
    localStorage.removeItem('pos_selected_customer');
    router.replace('/login');
  };

  const EXCLUDED_CATEGORIES = ['Ophaal Geschikt', 'Externe Productie', 'Kids'];

  const getProductCategory = (product) => {
    if (product.categories && product.categories.length > 0) {
      const validCategory = product.categories.find(
        (cat) => !EXCLUDED_CATEGORIES.includes(cat.name)
      );
      if (validCategory) return validCategory.name;
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
    const productVariations = Array.isArray(product.variations_data) && product.variations_data.length > 0
      ? product.variations_data
      : (Array.isArray(product.variations) && typeof product.variations[0] === 'object' ? product.variations : []);

    if (productVariations.length > 0) {
      setSelectedProductForVariations({
        ...product,
        variations_data: productVariations
      });
      return;
    }

    const stock = product.stock_quantity;
    const pPrice = parseFloat(product.price || 0);

    if (stock !== null && stock <= 0) {
      setStockWarningModal({ show: true, product, variation: null, price: pPrice });
      return;
    }

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

    const stock = openAmountProduct.stock_quantity;
    if (stock !== null && stock <= 0) {
      setStockWarningModal({ show: true, product: openAmountProduct, variation: null, price: enteredPrice });
      setOpenAmountProduct(null);
      setCustomPriceInput('');
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
    const varStock = variation.stock_quantity;

    if (varStock !== null && varStock <= 0) {
      setSelectedProductForVariations(null);
      setStockWarningModal({ show: true, product: selectedProductForVariations, variation, price: varPrice });
      return;
    }

    const attrText = formatAttributes(variation.attributes) || `Variatie #${variation.id}`;
    const varName = `${selectedProductForVariations.name} - ${attrText}`;

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

  const handleConfirmStockWarning = () => {
    const { product, variation, price } = stockWarningModal;
    if (variation) {
      const attrText = formatAttributes(variation.attributes) || `Variatie #${variation.id}`;
      const varName = `${product.name} - ${attrText}`;
      const cartItem = {
        ...product,
        id: `${product.id}_var_${variation.id}`,
        product_id: product.id,
        variation_id: variation.id,
        name: varName,
        price: price
      };
      addToCartCustom(cartItem);
    } else {
      addToCart(product, price);
    }
    setStockWarningModal({ show: false, product: null, variation: null, price: 0 });
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

  const triggerPrintReceipt = async (orderData) => {
    try {
      const response = await fetch('/api/pos/print-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData)
      });

      const htmlBlob = await response.text();
      const printWindow = window.open('', '_blank', 'width=400,height=600');
      if (printWindow) {
        printWindow.document.write(htmlBlob);
        printWindow.document.close();
      }
    } catch (err) {
      console.error('Fout bij afdrukken van bon:', err);
    }
  };

  // Aangepast om direct te communiceren met de zelfstandige SumUp Add-on microservice op poort 3001
  const processSumUpPayment = async (amount, storeId) => {
    const res = await fetch('http://localhost:3001/api/terminal/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalAmount: amount, storeId: storeId })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'SumUp weigert de betaling.');
    }
    return data;
  };

  const handleProcessPayment = async () => {
    if (selectedPaymentMethod === 'cash' && cashGivenFloat < finalTotal) {
      alert('Het ingegeven contante bedrag is lager dan het totaalbedrag.');
      return;
    }

    setLoading(true);
    setCheckoutStatus(null);

    if (selectedPaymentMethod === 'sumup') {
      try {
        const storeId = selectedStore?.id || selectedStore?.store_id || 1;
        await processSumUpPayment(finalTotal.toFixed(2), storeId);
      } catch (sumupErr) {
        console.error('[SUMUP ERROR]:', sumupErr.message);
        alert(`❌ SumUp Betaling Mislukt:\n\n${sumupErr.message}\n\nDe bestelling is GEANNULEERD en niet aangemaakt.`);
        setLoading(false);
        return;
      }
    }

    const orderPayload = {
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
      } : null,
      created_at: new Date().toISOString()
    };

    try {
      const res = await fetch('/api/woocommerce/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        const changeText = selectedPaymentMethod === 'cash' && changeDue > 0 ? ` (Wisselgeld: €${changeDue.toFixed(2)})` : '';
        setCheckoutStatus({ success: true, message: `Bestelling direct verwerkt in WooCommerce!${changeText}` });
      } else {
        throw new Error(data.error || `Server retourneerde HTTP ${res.status}`);
      }

    } catch (err) {
      console.warn('[POS OFFLINE FALLBACK] Directe checkout mislukt, opslaan in offline opslag:', err.message);

      const offlineQueue = JSON.parse(localStorage.getItem('pos_offline_orders') || '[]');
      offlineQueue.push(orderPayload);
      localStorage.setItem('pos_offline_orders', JSON.stringify(offlineQueue));
      setPendingOfflineCount(offlineQueue.length);

      const changeText = selectedPaymentMethod === 'cash' && changeDue > 0 ? ` (Wisselgeld: €${changeDue.toFixed(2)})` : '';
      setCheckoutStatus({ 
        success: true, 
        message: `⚠️ Directe checkout mislukt (${err.message}). Bestelling lokaal opgeslagen en wordt automatisch gesynchroniseerd zodra de server weer bereikbaar is.${changeText}` 
      });
    } finally {
      setShowPaymentModal(false);

      setCompletedOrderForReceipt({
        order: orderPayload,
        store: selectedStore,
        cashier: currentUser,
        paymentDetails: {
          method: selectedPaymentMethod,
          cashGiven: selectedPaymentMethod === 'cash' ? cashGivenFloat : null,
          changeDue: selectedPaymentMethod === 'cash' ? changeDue : null,
        }
      });

      setCart([]);
      setSelectedCustomer(null);
      localStorage.removeItem('pos_cart');
      localStorage.removeItem('pos_selected_customer');

      setPointsToRedeem(0);
      setRedeemedDiscount(0);
      setDiscountType('none');
      setDiscountValue(0);
      setCashGiven('');
      setLoading(false);
    }
  };

  const storeDisplayName = selectedStore?.store_name || selectedStore?.name || 'Selecteer Filiaal';

  const filteredPickupOrders = pickupOrders.filter(order => {
    if (!selectedStore?.pickup_id) return true;
    return order.shipping_lines?.some(s => s.meta_data?.some(m => m.key === 'pickup_location_id' && m.value === String(selectedStore.pickup_id)));
  });

  const filteredProducts = activeProducts.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const pCat = getProductCategory(p);
    const matchesCategory = selectedCategory === 'ALL' || pCat === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredCustomers = customers.filter((c) =>
    `${c.first_name || ''} ${c.last_name || ''} ${c.email || ''}`.toLowerCase().includes(customerSearch.toLowerCase())
  );

  if (isChecking || !currentUser) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-2">
          <h1 className="text-white font-black text-xl tracking-wider">BDM POS</h1>
          <div className="text-red-600 font-bold text-xs uppercase tracking-widest animate-pulse">
            Sessie controleren...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col relative">
      {/* Header */}
      <header className="bg-black text-white p-3 sm:p-4 flex flex-col md:flex-row justify-between items-center gap-3 shadow-md z-10">
        <div className="flex flex-wrap items-center gap-2 justify-center md:justify-start w-full md:w-auto">
          <span className="font-bold text-lg sm:text-xl tracking-wider">BDM POS</span>
          
          <button
            onClick={() => setShowStoreModal(true)}
            className="text-xs bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded font-bold uppercase flex items-center space-x-1 shadow-sm transition"
          >
            <span>📍</span>
            <span className="truncate max-w-[120px] sm:max-w-none">{storeDisplayName}</span>
          </button>

          {currentUser && (
            <span className="text-[11px] sm:text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded">
              {currentUser.username} ({currentUser.role})
            </span>
          )}

          {pendingOfflineCount > 0 && (
            <button
              onClick={() => triggerOfflineSync(true)}
              title="Klik om direct te synchroniseren of te wissen"
              className="text-[10px] bg-yellow-500 hover:bg-yellow-400 text-black font-extrabold px-2.5 py-1 rounded-full transition flex items-center space-x-1 shadow animate-pulse cursor-pointer"
            >
              <span>⚠️ {pendingOfflineCount} Offline</span>
            </button>
          )}
        </div>
        
        <div className="flex flex-wrap items-center gap-2 justify-center md:justify-end w-full md:w-auto">
          <button
            onClick={() => setActiveTab('pos')}
            className={`px-3 py-1.5 rounded text-xs font-bold transition ${activeTab === 'pos' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
          >
            🛒 Kassa
          </button>
          
          <button
            onClick={() => { setActiveTab('pickup'); fetchPickupOrders(); }}
            className={`px-3 py-1.5 rounded text-xs font-bold transition flex items-center space-x-1 ${activeTab === 'pickup' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
          >
            <span>📦 Afhaalbalie</span>
            {filteredPickupOrders.length > 0 && (
              <span className="bg-white text-black px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                {filteredPickupOrders.length}
              </span>
            )}
          </button>

          <button
            onClick={handleSyncData}
            disabled={isSyncing}
            className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded text-xs font-semibold transition flex items-center space-x-1"
          >
            <span>{isSyncing ? '⏳ Syncing...' : '🔄 Sync'}</span>
          </button>

          {(currentUser.role === 'admin' || currentUser.role === 'super_admin') && (
            <Link href="/admin">
              <button className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded text-xs font-semibold transition">
                ⚙️ Admin
              </button>
            </Link>
          )}

          <button
            onClick={handleLogout}
            className="bg-red-700 hover:bg-red-800 text-white px-3 py-1.5 rounded text-xs font-semibold transition"
          >
            🚪 Loguit
          </button>
        </div>
      </header>

      {activeTab === 'pickup' ? (
        <div className="flex-1 p-3 sm:p-6 max-w-6xl mx-auto w-full">
          <div className="bg-white rounded-lg shadow p-4 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b">
              <div>
                <h2 className="text-base sm:text-lg font-bold">📦 Lokale Afhaalbestellingen</h2>
                <p className="text-xs text-gray-500">
                  Overzicht gekoppeld aan: <span className="font-bold text-red-600">{storeDisplayName}</span>
                </p>
              </div>
              <button
                onClick={fetchPickupOrders}
                disabled={loadingPickup}
                className="bg-black hover:bg-gray-800 text-white text-xs font-bold px-4 py-2 rounded transition w-full sm:w-auto"
              >
                {loadingPickup ? '⏳ Laden...' : '🔄 Verversen'}
              </button>
            </div>

            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-left text-xs divide-y min-w-[600px]">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="p-3">Order ID</th>
                    <th className="p-3">Klant</th>
                    <th className="p-3">Afhaallocatie</th>
                    <th className="p-3">Artikelen</th>
                    <th className="p-3">Totaal</th>
                    <th className="p-3 text-right">Actie</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredPickupOrders.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-8 text-center text-gray-400">
                        {loadingPickup ? 'Bestellingen ophalen...' : 'Geen openstaande afhaalbestellingen voor deze locatie.'}
                      </td>
                    </tr>
                  ) : (
                    filteredPickupOrders.map(order => {
                      const shippingLine = order.shipping_lines?.[0];
                      const pickupLocation = shippingLine?.meta_data?.find(m => m.key === 'Pickup Location' || m.key === 'location')?.value || shippingLine?.method_title || 'Lokale Afhaling';

                      return (
                        <tr key={order.id} className="hover:bg-gray-50">
                          <td className="p-3 font-bold">#{order.number || order.id}</td>
                          <td className="p-3 font-medium">
                            {order.billing?.first_name} {order.billing?.last_name}
                            <div className="text-[10px] text-gray-400">{order.billing?.email}</div>
                          </td>
                          <td className="p-3 text-gray-700 font-semibold">📍 {pickupLocation}</td>
                          <td className="p-3 text-gray-600 max-w-xs truncate">
                            {order.line_items?.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                          </td>
                          <td className="p-3 font-bold text-red-600">€{parseFloat(order.total || 0).toFixed(2)}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleMarkAsPickedUp(order.id)}
                              className="bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-2 rounded text-xs uppercase shadow-sm"
                            >
                              ✓ Als opgehaald
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row p-3 sm:p-4 gap-4 overflow-hidden">
          {/* Producten & Zoeken */}
          <div className="w-full lg:w-3/5 flex flex-col bg-white rounded-lg shadow p-3 sm:p-4">
            <div className="flex space-x-2 mb-3">
              <input
                type="text"
                placeholder="Zoek producten op naam..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 p-2.5 sm:p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-black text-sm"
              />
              <button
                onClick={() => setShowCustomModal(true)}
                className="bg-black hover:bg-gray-800 text-white font-bold px-3 py-2 rounded text-xs whitespace-nowrap transition"
              >
                + Custom
              </button>
            </div>

            <div className="flex space-x-2 overflow-x-auto pb-3 mb-3 border-b no-scrollbar">
              <button
                onClick={() => setSelectedCategory('ALL')}
                className={`px-3 sm:px-4 py-2 rounded text-xs font-bold whitespace-nowrap transition ${
                  selectedCategory === 'ALL'
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                }`}
              >
                📦 Alles ({activeProducts.length})
              </button>
              {categoriesList.map((cat) => {
                const count = activeProducts.filter((p) => getProductCategory(p) === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 sm:px-4 py-2 rounded text-xs font-bold whitespace-nowrap transition ${
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

            <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3 max-h-[calc(100vh-280px)]">
              {filteredProducts.map((product) => {
                const imageUrl = product.images && product.images.length > 0 ? product.images[0].src : null;
                const productVariations = Array.isArray(product.variations_data) && product.variations_data.length > 0
                  ? product.variations_data
                  : (Array.isArray(product.variations) && typeof product.variations[0] === 'object' ? product.variations : []);
                const hasVariations = productVariations.length > 0;
                const isPriceZero = parseFloat(product.price || 0) === 0;
                const stockQty = product.stock_quantity;

                return (
                  <div
                    key={product.id}
                    onClick={() => handleProductClick(product)}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-2 flex flex-col justify-between cursor-pointer hover:border-black transition shadow-sm hover:shadow relative z-0"
                  >
                    <div>
                      <div className="w-full aspect-square bg-gray-200 rounded mb-2 overflow-hidden flex items-center justify-center relative">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-gray-400 text-xs font-bold">GEEN FOTO</span>
                        )}

                        {hasVariations && (
                          <span className="absolute top-2 right-2 bg-black text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase z-1 shadow">
                            Variaties
                          </span>
                        )}

                        {stockQty !== null && (
                          <span className={`absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded font-bold ${stockQty <= 0 ? 'bg-red-600 text-white' : 'bg-black text-white'}`}>
                            {stockQty}
                          </span>
                        )}
                      </div>
                      <h3 className="font-semibold text-xs line-clamp-2">{product.name}</h3>
                    </div>

                    <div className="mt-2 flex justify-between items-center">
                      <span className="text-[10px] text-gray-500 font-bold uppercase truncate max-w-[70px]">
                        {getProductCategory(product)}
                      </span>
                      <span className="font-bold text-xs sm:text-sm text-red-600">
                        {isPriceZero ? 'Open' : `€${parseFloat(product.price || 0).toFixed(2)}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Winkelmand / Kassa */}
          <div className="w-full lg:w-2/5 flex flex-col bg-white rounded-lg shadow p-3 sm:p-4 justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-bold mb-3 border-b pb-2">Huidige Bestelling</h2>

              {/* Gekoppelde Klant */}
              <div className="mb-3 bg-gray-50 p-2 rounded border">
                <label className="text-xs font-bold text-gray-600 block mb-1">Gekoppelde Klant:</label>
                {selectedCustomer ? (
                  <div className="flex justify-between items-center text-sm">
                    <div>
                      <span className="font-semibold text-black block">
                        {selectedCustomer.first_name} {selectedCustomer.last_name || ''}
                      </span>
                      <span className="text-[11px] text-gray-500 block">{selectedCustomer.email}</span>
                    </div>
                    <button onClick={() => { setSelectedCustomer(null); setPointsToRedeem(0); setRedeemedDiscount(0); }} className="text-red-500 text-xs underline">Ontkoppel</button>
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      placeholder="Zoek klant of medewerker..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="w-full p-1.5 text-xs border rounded mb-1"
                    />
                    {customerSearch && (
                      <div className="max-h-28 overflow-y-auto bg-white border rounded">
                        {filteredCustomers.slice(0, 6).map((c) => (
                          <div
                            key={c.id}
                            onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); }}
                            className="p-1.5 text-xs hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                          >
                            <div className="font-bold">{c.first_name} {c.last_name || ''}</div>
                            <div className="text-[10px] text-gray-500">{c.email}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="overflow-y-auto max-h-36 sm:max-h-44 mb-3 divide-y">
                {cart.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">Geen artikelen in winkelmand</p>
                ) : (
                  cart.map((item) => (
                    <div key={item.id} className="py-2 flex justify-between items-center text-xs sm:text-sm">
                      <div className="pr-2">
                        <div className="font-medium">{item.name}</div>
                        <div className="text-[11px] text-gray-500">€{parseFloat(item.price).toFixed(2)} x {item.quantity}</div>
                      </div>
                      <div className="flex items-center space-x-1.5 shrink-0">
                        <button onClick={() => updateQuantity(item.id, -1)} className="w-6 h-6 bg-gray-200 rounded font-bold flex items-center justify-center">-</button>
                        <span className="w-5 text-center">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.id, 1)} className="w-6 h-6 bg-gray-200 rounded font-bold flex items-center justify-center">+</button>
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
                    className="border p-1 rounded text-xs"
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
                    className="w-full p-1.5 border rounded text-xs"
                  />
                )}

                <div className="bg-gray-50 p-2 rounded border">
                  <span className="font-semibold block mb-1">Punten Inwisselen (100 pnt = €5):</span>
                  <div className="flex space-x-2">
                    <input
                      type="number"
                      min="0"
                      placeholder="Punten"
                      value={pointsToRedeem}
                      onChange={(e) => setPointsToRedeem(e.target.value)}
                      className="flex-1 p-1.5 border rounded text-xs"
                    />
                    <button
                      onClick={handleRedeemPoints}
                      className="bg-black text-white px-3 py-1.5 rounded text-xs font-semibold"
                    >
                      Wissel
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t pt-3 mt-2">
              <div className="flex justify-between text-xs sm:text-sm mb-1">
                <span>Subtotaal:</span>
                <span>€{subtotal.toFixed(2)}</span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between text-xs sm:text-sm text-red-600 mb-1">
                  <span>Korting:</span>
                  <span>-€{totalDiscount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base sm:text-lg font-bold mb-3">
                <span>Totaal:</span>
                <span>€{finalTotal.toFixed(2)}</span>
              </div>

              {selectedCustomer && (
                <div className="text-[11px] text-green-600 mb-2 font-medium">
                  ✨ Deze bestelling levert {Math.floor(finalTotal)} punten op voor {selectedCustomer.first_name || selectedCustomer.username}.
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
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-bold py-3 rounded transition text-xs sm:text-sm uppercase tracking-wider"
              >
                {loading ? '⏳ Bezig met pinnen...' : `Afrekenen (€${finalTotal.toFixed(2)})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {openAmountProduct && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-base sm:text-lg font-bold mb-2">Invoeren Open Bedrag</h3>
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
              <button onClick={() => setOpenAmountProduct(null)} className="w-1/2 bg-gray-200 text-black font-bold py-2.5 rounded text-xs">Annuleren</button>
              <button onClick={handleConfirmOpenAmount} className="w-1/2 bg-red-600 text-white font-bold py-2.5 rounded text-xs">Toevoegen</button>
            </div>
          </div>
        </div>
      )}

      {showCustomModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <h3 className="text-base sm:text-lg font-bold mb-4">Custom Artikel Toevoegen</h3>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Artikelnaam</label>
                <input
                  type="text"
                  placeholder="Bijv. Handmatige service"
                  value={customItem.name}
                  onChange={(e) => setCustomItem({...customItem, name: e.target.value})}
                  className="w-full p-2.5 border rounded text-sm"
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
                  className="w-full p-2.5 border rounded text-sm"
                />
              </div>
            </div>
            <div className="flex space-x-2">
              <button onClick={() => setShowCustomModal(false)} className="w-1/2 bg-gray-200 py-2.5 rounded text-xs font-bold">Annuleren</button>
              <button onClick={handleAddCustomItem} className="w-1/2 bg-red-600 text-white py-2.5 rounded text-xs font-bold">Toevoegen</button>
            </div>
          </div>
        </div>
      )}

      {selectedProductForVariations && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-base sm:text-lg font-bold mb-1">Kies Variatie</h3>
            <p className="text-xs text-gray-600 mb-4">{selectedProductForVariations.name}</p>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
              {(selectedProductForVariations.variations_data || []).map((v) => {
                const attrText = formatAttributes(v.attributes) || `Variatie #${v.id}`;
                return (
                  <button
                    key={v.id}
                    onClick={() => handleSelectVariation(v)}
                    className="w-full text-left p-3 border rounded hover:border-black flex justify-between items-center bg-gray-50 font-semibold text-xs"
                  >
                    <div>
                      <div>{attrText}</div>
                      <div className="text-[10px] text-gray-500">Voorraad: {v.stock_quantity ?? 'N.v.t.'}</div>
                    </div>
                    <span className="text-red-600 font-bold">€{parseFloat(v.price || selectedProductForVariations.price || 0).toFixed(2)}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setSelectedProductForVariations(null)} className="w-full bg-gray-200 text-black font-bold py-2.5 rounded text-xs">Sluiten</button>
          </div>
        </div>
      )}

      {stockWarningModal.show && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg shadow-2xl max-w-sm w-full p-6 space-y-4 text-center">
            <div className="text-red-600 text-4xl">⚠️</div>
            <h3 className="text-base sm:text-lg font-bold">Voorraad Waarschuwing</h3>
            <p className="text-xs text-gray-600 font-semibold">Weet je zeker dat je dit product hebt</p>
            <div className="flex space-x-2 pt-2">
              <button onClick={() => setStockWarningModal({ show: false, product: null, variation: null, price: 0 })} className="w-1/2 bg-gray-200 text-black font-bold py-2.5 rounded text-xs">Nee</button>
              <button onClick={handleConfirmStockWarning} className="w-1/2 bg-red-600 text-white font-bold py-2.5 rounded text-xs">Ja, Toevoegen</button>
            </div>
          </div>
        </div>
      )}

      {showStoreModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-base sm:text-lg font-bold">📍 Koppel Kassasysteem aan Filiaal</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {allStores.map(store => (
                <button
                  key={store.id || store.store_id}
                  onClick={() => handleSelectStore(store)}
                  className="w-full p-3 border rounded text-left hover:bg-gray-100 transition flex justify-between items-center"
                >
                  <div>
                    <div className="font-bold text-sm">{store.store_name || store.name}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-base sm:text-lg font-bold mb-4 border-b pb-2">Kies Betaalmethode</h3>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <button onClick={() => setSelectedPaymentMethod('sumup')} className={`p-3 text-xs font-bold border rounded ${selectedPaymentMethod === 'sumup' ? 'bg-black text-white' : 'bg-gray-100'}`}>💳 SumUp</button>
              <button onClick={() => setSelectedPaymentMethod('manual_pin')} className={`p-3 text-xs font-bold border rounded ${selectedPaymentMethod === 'manual_pin' ? 'bg-black text-white' : 'bg-gray-100'}`}>📌 Pin</button>
              <button onClick={() => setSelectedPaymentMethod('cash')} className={`p-3 text-xs font-bold border rounded ${selectedPaymentMethod === 'cash' ? 'bg-black text-white' : 'bg-gray-100'}`}>💵 Contant</button>
            </div>
            {selectedPaymentMethod === 'cash' && (
              <div className="bg-gray-50 p-4 rounded border mb-4 space-y-3">
                <input type="number" step="0.01" value={cashGiven} onChange={(e) => setCashGiven(e.target.value)} className="w-full p-2.5 border rounded font-bold text-lg" placeholder="Ontvangen bedrag" />
                <div className="bg-black text-white p-2.5 rounded flex justify-between">
                  <span>Wisselgeld:</span>
                  <span className="text-green-400 font-bold">€{changeDue.toFixed(2)}</span>
                </div>
              </div>
            )}
            <div className="flex space-x-2">
              <button onClick={() => setShowPaymentModal(false)} className="w-1/3 bg-gray-200 py-3 rounded text-xs font-bold">Annuleren</button>
              <button onClick={handleProcessPayment} disabled={loading} className="w-2/3 bg-red-600 text-white py-3 rounded text-xs font-bold">{loading ? '⏳ Even wachten...' : 'Voltooien'}</button>
            </div>
          </div>
        </div>
      )}

      {completedOrderForReceipt && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
            <h3 className="text-base sm:text-lg font-bold">Kassabon Afdrukken?</h3>
            <div className="flex space-x-2 pt-2">
              <button onClick={() => setCompletedOrderForReceipt(null)} className="w-1/2 bg-gray-200 py-3 rounded text-xs font-bold">Sluiten</button>
              <button onClick={() => { triggerPrintReceipt(completedOrderForReceipt); setCompletedOrderForReceipt(null); }} className="w-1/2 bg-red-600 text-white py-3 rounded text-xs font-bold">🖨️ Print</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}