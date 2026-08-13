// pages/index.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { db, saveOfflineOrder } from '../lib/db';
import axios from 'axios';
import { useOfflineSync } from '../hooks/useOfflineSync';

export default function BendemenPOS() {
  const router = useRouter();
  
  // --- SYNC MANAGER HOOK ---
  const { isSyncingOrders, unsyncedCount, syncOfflineOrders, checkUnsyncedOrders } = useOfflineSync();

  // --- STATE ---
  const [cart, setCart] = useState([]);
  const [products, setProducts] = useState([]);
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncingProducts, setIsSyncingProducts] = useState(false);
  const [isWaitingForPin, setIsWaitingForPin] = useState(false);
  
  // Open Prijs / Bedrag Scherm State
  const [openPriceModal, setOpenPriceModal] = useState(false);
  const [activeOpenProduct, setActiveOpenProduct] = useState(null);
  const [customPriceInput, setCustomPriceInput] = useState('');

  // Authenticatie state
  const [currentUser, setCurrentUser] = useState(null);
  const [activeStore, setActiveStore] = useState(null);

  // Korting en Punten state (100 punten = €5,00 -> conversie = 0.05)
  const [discount, setDiscount] = useState({ type: 'none', value: 0 }); 
  const [pointsToUse, setPointsToUse] = useState(0);
  const pointsConversionRate = 0.05; 

  // Klant state
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  // --- LIFECYCLE ---
  useEffect(() => {
    const token = localStorage.getItem('pos_token');
    if (!token) {
      router.push('/login');
      return;
    }
    setCurrentUser(JSON.parse(localStorage.getItem('pos_user')));
    setActiveStore(JSON.parse(localStorage.getItem('pos_active_store')));

    setIsOnline(navigator.onLine);
    window.addEventListener('online', () => setIsOnline(true));
    window.addEventListener('offline', () => setIsOnline(false));

    loadLocalProducts();
  }, [router]);

  // --- PRODUCTEN ---
  const loadLocalProducts = async () => {
    const localProducts = await db.products.toArray();
    setProducts(localProducts);
  };

  const syncProducts = async () => {
    if (!isOnline) {
      alert("Je bent momenteel offline. Verbind met internet om producten te updaten.");
      return;
    }
    
    setIsSyncingProducts(true);
    try {
      const response = await axios.get(`/api/woocommerce/products?storeId=${activeStore.id}`);
      if (response.data.success) {
        await db.products.clear();
        await db.products.bulkAdd(response.data.products);
        setProducts(response.data.products);
        alert(`Producten voor ${activeStore.name} succesvol gesynchroniseerd!`);
      }
    } catch (error) {
      const errorMsg = error.response?.data?.error || 'Fout bij synchroniseren van producten.';
      alert(errorMsg);
    } finally {
      setIsSyncingProducts(false);
    }
  };

  // --- KLANTEN ZOEKEN ---
  const searchCustomer = async () => {
    if (!isOnline) {
      alert("Je bent offline, je kunt nu geen klanten zoeken in WooCommerce.");
      return;
    }
    if (customerSearch.length > 2) {
      setIsSearching(true);
      try {
        const response = await axios.get(`/api/woocommerce/customers?search=${customerSearch}`);
        setCustomerResults(response.data.customers);
      } catch (error) {
        alert('Fout bij zoeken naar klant.');
      }
      setIsSearching(false);
    }
  };

  // --- WINKELWAGEN LOGICA & OPEN PRIJS ---
  const handleProductClick = (product) => {
    if (product.price === 0) {
      setActiveOpenProduct(product);
      setCustomPriceInput('');
      setOpenPriceModal(true);
    } else {
      addToCartWithPrice(product, product.price);
    }
  };

  const addToCartWithPrice = (product, unitPrice) => {
    const itemKey = product.variation_id ? `${product.id}-${product.variation_id}` : `${product.id}`;
    const existingItem = cart.find(item => (item.variation_id ? `${item.id}-${item.variation_id}` : `${item.id}`) === itemKey && item.price === unitPrice);
    
    if (existingItem) {
      setCart(cart.map(item => 
        ((item.variation_id ? `${item.id}-${item.variation_id}` : `${item.id}`) === itemKey && item.price === unitPrice) 
          ? { ...item, quantity: item.quantity + 1 } 
          : item
      ));
    } else {
      setCart([...cart, { ...product, price: unitPrice, quantity: 1 }]);
    }
  };

  const confirmCustomPrice = () => {
    const price = parseFloat(customPriceInput);
    if (isNaN(price) || price <= 0) {
      alert('Vul alstublieft een geldig bedrag in.');
      return;
    }
    addToCartWithPrice(activeOpenProduct, price);
    setOpenPriceModal(false);
    setActiveOpenProduct(null);
    setCustomPriceInput('');
  };

  const updateQuantity = (id, variationId, delta) => {
    setCart(cart.map(item => {
      if (item.id === id && (item.variation_id || 0) === (variationId || 0)) {
        const newQuantity = item.quantity + delta;
        return newQuantity > 0 ? { ...item, quantity: newQuantity } : item;
      }
      return item;
    }));
  };

  const removeItem = (id, variationId) => {
    setCart(cart.filter(item => !(item.id === id && (item.variation_id || 0) === (variationId || 0))));
  };

  // --- BEREKENINGEN & PUNTEN BEVEILIGING ---
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  let discountAmount = 0;
  if (discount.type === 'fixed') discountAmount = discount.value;
  if (discount.type === 'percentage') discountAmount = subtotal * (discount.value / 100);
  
  const maxCustomerPoints = selectedCustomer ? (selectedCustomer.points_balance || 0) : 0;
  const validPointsToUse = Math.max(0, pointsToUse);
  const finalPointsToUse = selectedCustomer ? Math.min(validPointsToUse, maxCustomerPoints) : 0;
  
  const pointsDiscount = finalPointsToUse > 0 ? finalPointsToUse * pointsConversionRate : 0;
  const total = Math.max(0, subtotal - discountAmount - pointsDiscount);

  // --- AFREKENEN & RESET ---
  const handleCheckout = async (isPin = false) => {
    const orderData = { 
      orderItems: cart, 
      paymentMethod: isPin ? 'sumup' : 'cash',
      storeId: activeStore.id,
      cashierId: currentUser.id,
      customerId: selectedCustomer ? selectedCustomer.id : 0,
      totals: { subtotal, discountAmount, pointsDiscount: pointsDiscount, total, pointsUsed: finalPointsToUse }
    };

    if (!isOnline) {
      if (isPin) {
        alert("Pinnen is niet mogelijk zonder internetverbinding!");
        return;
      }
      await saveOfflineOrder(orderData);
      alert('Offline modus: Order is lokaal opgeslagen en wordt automatisch verstuurd zodra er internet is.');
      checkUnsyncedOrders();
      resetCart();
      return;
    }

    try {
      if (isPin) {
        setIsWaitingForPin(true);
        const sumupRes = await axios.post('/api/sumup/checkout', {
          totalAmount: total,
          terminalId: 'JOUW_SUMUP_TERMINAL_ID'
        });

        if (!sumupRes.data.success) {
          throw new Error('Pintransactie mislukt.');
        }
        setIsWaitingForPin(false);
      }

      await axios.post('/api/woocommerce/order', orderData);
      alert(`Bendemen POS: Order succesvol afgerekend via ${isPin ? 'Pin' : 'Contant'}!`);
      resetCart();
    } catch (error) {
      setIsWaitingForPin(false);
      alert('Bendemen POS: Fout bij afrekenen. Transactie afgebroken.');
    }
  };

  const resetCart = () => {
    setCart([]);
    setDiscount({ type: 'none', value: 0 });
    setPointsToUse(0);
    setSelectedCustomer(null);
    setCustomerSearch('');
    setCustomerResults([]);
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/login');
  };

  if (!currentUser || !activeStore) return null; 

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'Arial', position: 'relative' }}>
      
      {/* LINKER KANT: Producten */}
      <div style={{ flex: '2', padding: '20px', borderRight: '1px solid #ddd', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>Producten</h2>
          <div style={{ display: 'flex', gap: '10px' }}>
            {(currentUser.role === 'administrator' || currentUser.role === 'shop_manager') && (
              <button onClick={() => router.push('/admin')} style={{ padding: '10px', background: '#0070f3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
                ⚙️ Beheer
              </button>
            )}
            <button onClick={syncProducts} disabled={isSyncingProducts || !isOnline} style={{ padding: '10px', background: '#333', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
              {isSyncingProducts ? '🔄 Syncing...' : '🔄 Sync met WooCommerce'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '15px' }}>
          {products.length === 0 ? <p>Geen producten. Druk op Sync.</p> : products.map(product => (
            <div key={`${product.id}-${product.variation_id || 0}`} onClick={() => handleProductClick(product)} style={{ border: '1px solid #ccc', borderRadius: '8px', padding: '15px', cursor: 'pointer', textAlign: 'center', background: product.price === 0 ? '#fffbe6' : '#f9f9f9' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '14px' }}>{product.name}</div>
              <div style={{ color: '#0070f3' }}>
                {product.price === 0 ? 'Vrij Bedrag' : `€${product.price.toFixed(2)}`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RECHTER KANT: Winkelwagen Geavanceerd */}
      <div style={{ flex: '1.5', padding: '20px', display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h1 style={{ fontSize: '20px', margin: '0' }}>Bendemen POS {isOnline ? '🟢' : '🔴'}</h1>
          
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {unsyncedCount > 0 && (
              <button 
                onClick={syncOfflineOrders}
                disabled={isSyncingOrders || !isOnline}
                style={{ 
                  padding: '5px 10px', 
                  background: isOnline ? '#ff9900' : '#ccc', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '5px', 
                  cursor: isOnline ? 'pointer' : 'not-allowed',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}
              >
                {isSyncingOrders ? '⏳ Syncen...' : `⚠️ ${unsyncedCount} orders offline`}
              </button>
            )}

            <button onClick={handleLogout} style={{ padding: '5px 10px', background: 'transparent', color: 'red', border: '1px solid red', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>
              Uitloggen
            </button>
          </div>
        </div>
        
        <div style={{ marginBottom: '15px', fontSize: '12px', background: '#fff', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}>
          Locatie: <strong>{activeStore.name}</strong> | Kassa: <strong>{currentUser.name}</strong>
        </div>

        {/* Klant Zoeken & Koppelen */}
        <div style={{ background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '15px' }}>
          <label style={{ fontSize: '14px', fontWeight: 'bold', display: 'block', marginBottom: '10px' }}>Klant Koppelen</label>
          
          {selectedCustomer ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#e6f7ff', padding: '10px', borderRadius: '5px', border: '1px solid #91d5ff' }}>
              <div>
                <strong>{selectedCustomer.name}</strong> <br/>
                <span style={{ fontSize: '12px', color: '#555' }}>
                  Huidige punten: <strong style={{ color: '#0070f3' }}>{maxCustomerPoints}</strong> 
                  (waarde: €{(maxCustomerPoints * pointsConversionRate).toFixed(2)})
                </span>
              </div>
              <button 
                onClick={() => { setSelectedCustomer(null); setPointsToUse(0); }} 
                style={{ padding: '5px 10px', background: 'transparent', border: '1px solid red', color: 'red', borderRadius: '3px', cursor: 'pointer' }}
              >
                Loskoppelen
              </button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input 
                  type="text" 
                  placeholder="Zoek op naam of email..." 
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchCustomer()}
                  style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                />
                <button 
                  onClick={searchCustomer} 
                  style={{ padding: '8px 15px', background: '#333', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                >
                  {isSearching ? 'Zoeken...' : 'Zoek'}
                </button>
              </div>
              
              {customerResults.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, marginTop: '10px', maxHeight: '150px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '4px' }}>
                  {customerResults.map(customer => (
                    <li 
                      key={customer.id} 
                      onClick={() => { setSelectedCustomer(customer); setCustomerResults([]); setCustomerSearch(''); }} 
                      style={{ padding: '10px', borderBottom: '1px solid #eee', cursor: 'pointer', background: '#fafafa' }}
                    >
                      <div style={{ fontWeight: 'bold' }}>{customer.name}</div>
                      <div style={{ fontSize: '12px', color: '#666' }}>{customer.email} | Punten: {customer.points_balance}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Winkelwagen Lijst */}
        <div style={{ flexGrow: 1, overflowY: 'auto', background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '15px' }}>
          {cart.length === 0 ? <p style={{ color: '#888', textAlign: 'center' }}>Winkelmandje is leeg</p> : cart.map(item => (
            <div key={`${item.id}-${item.variation_id || 0}-${item.price}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee', paddingBottom: '10px', marginBottom: '10px' }}>
              <div style={{ flex: '1' }}>
                <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                <div style={{ color: '#666', fontSize: '14px' }}>€{item.price.toFixed(2)} per stuk</div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button onClick={() => updateQuantity(item.id, item.variation_id, -1)} style={{ padding: '5px 10px', cursor: 'pointer' }}>-</button>
                <span style={{ width: '20px', textAlign: 'center' }}>{item.quantity}</span>
                <button onClick={() => updateQuantity(item.id, item.variation_id, 1)} style={{ padding: '5px 10px', cursor: 'pointer' }}>+</button>
                <button onClick={() => removeItem(item.id, item.variation_id)} style={{ padding: '5px 10px', background: 'red', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>X</button>
              </div>
              <div style={{ width: '70px', textAlign: 'right', fontWeight: 'bold' }}>
                €{(item.price * item.quantity).toFixed(2)}
              </div>
            </div>
          ))}
        </div>

        {/* Korting & Veilige Punten Sectie */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
          <div style={{ flex: 1, background: '#fff', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Handmatige Korting</label>
            <div style={{ display: 'flex', gap: '5px' }}>
              <select onChange={(e) => setDiscount({ ...discount, type: e.target.value })} value={discount.type} style={{ padding: '5px' }}>
                <option value="none">Geen</option>
                <option value="fixed">€</option>
                <option value="percentage">%</option>
              </select>
              <input 
                type="number" 
                min="0"
                value={discount.value} 
                onChange={(e) => setDiscount({ ...discount, value: parseFloat(e.target.value) || 0 })}
                disabled={discount.type === 'none'}
                style={{ width: '100%', padding: '5px' }}
              />
            </div>
          </div>
          
          <div style={{ flex: 1, background: '#fff', padding: '10px', borderRadius: '5px', border: '1px solid #ddd' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>Punten Inwisselen</label>
            <input 
              type="number" 
              min="0"
              placeholder="Aantal punten"
              value={pointsToUse || ''}
              onChange={(e) => setPointsToUse(Math.max(0, parseInt(e.target.value) || 0))}
              disabled={!selectedCustomer || maxCustomerPoints <= 0}
              style={{ width: '100%', padding: '5px', boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: '11px', color: '#666', marginTop: '3px' }}>
              {!selectedCustomer 
                ? 'Koppel eerst een klant' 
                : `Korting: €${pointsDiscount.toFixed(2)} (Max: ${maxCustomerPoints})`}
            </div>
          </div>
        </div>

        {/* Totalen Overzicht */}
        <div style={{ background: '#111', color: 'white', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '14px' }}>
            <span>Subtotaal:</span> <span>€{subtotal.toFixed(2)}</span>
          </div>
          {discountAmount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '14px', color: '#ffaaaa' }}>
              <span>Korting:</span> <span>- €{discountAmount.toFixed(2)}</span>
            </div>
          )}
          {pointsDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '14px', color: '#ffaaaa' }}>
              <span>Punten Korting ({finalPointsToUse}p):</span> <span>- €{pointsDiscount.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #333', fontSize: '24px', fontWeight: 'bold' }}>
            <span>Totaal:</span> <span>€{total.toFixed(2)}</span>
          </div>
        </div>

        {/* Knoppen (Contant & Pin) */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={resetCart} style={{ flex: 1, padding: '15px', background: '#fff', color: 'red', border: '1px solid red', borderRadius: '5px', cursor: 'pointer' }}>Leegmaken</button>
          
          <button 
            onClick={() => handleCheckout(false)} 
            disabled={cart.length === 0} 
            style={{ flex: 2, padding: '15px', background: cart.length === 0 ? '#ccc' : '#0070f3', color: 'white', border: 'none', borderRadius: '5px', fontSize: '18px', cursor: cart.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            Contant
          </button>
          
          <button 
            onClick={() => handleCheckout(true)} 
            disabled={cart.length === 0 || isWaitingForPin} 
            style={{ flex: 2, padding: '15px', background: cart.length === 0 ? '#ccc' : '#28a745', color: 'white', border: 'none', borderRadius: '5px', fontSize: '18px', cursor: cart.length === 0 || isWaitingForPin ? 'not-allowed' : 'pointer' }}
          >
            {isWaitingForPin ? '⏳ Wachten op terminal...' : 'PIN (SumUp)'}
          </button>
        </div>
      </div>

      {/* --- OPEN PRIJS MODAL SCHERM --- */}
      {openPriceModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '30px', borderRadius: '10px', width: '350px', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '20px' }}>{activeOpenProduct?.name}</h3>
            <p style={{ color: '#666', fontSize: '14px', marginBottom: '20px' }}>Voer het gewenste bedrag in voor dit product.</p>
            
            <input 
              type="number" 
              step="0.01"
              min="0"
              autoFocus
              placeholder="0.00"
              value={customPriceInput}
              onChange={(e) => setCustomPriceInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && confirmCustomPrice()}
              style={{ width: '100%', padding: '12px', fontSize: '22px', textAlign: 'center', boxSizing: 'border-box', marginBottom: '20px', border: '2px solid #0070f3', borderRadius: '6px' }}
            />

            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => setOpenPriceModal(false)}
                style={{ flex: 1, padding: '12px', background: '#ccc', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px' }}
              >
                Annuleren
              </button>
              <button 
                onClick={confirmCustomPrice}
                style={{ flex: 1, padding: '12px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold' }}
              >
                Toevoegen
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}