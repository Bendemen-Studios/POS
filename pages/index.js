import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function POSHome() {
  const router = useRouter();
  const effectCallbacks = useRef({});
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedStore, setSelectedStore] = useState(() => { if (typeof window === 'undefined') return null; try { return JSON.parse(localStorage.getItem('selectedStore') || localStorage.getItem('pos_selected_store') || 'null'); } catch (_) { return null; } });
  const [allStores, setAllStores] = useState([]);
  const [activeTab, setActiveTab] = useState(() => { if (typeof window !== 'undefined') return localStorage.getItem('pos_active_tab') || 'pos'; return 'pos'; });
  const [isChecking, setIsChecking] = useState(false);
  const [products, setProducts] = useState(() => { if (typeof window !== 'undefined') { try { const savedStore = JSON.parse(localStorage.getItem('selectedStore') || localStorage.getItem('pos_selected_store') || 'null'); const storeId = savedStore?.id || savedStore?.store_id; if (!storeId) return []; const saved = localStorage.getItem('pos_cached_products_' + storeId); return saved ? JSON.parse(saved) : []; } catch (_) { return []; } } return []; });
  const [catalogCategoryRules, setCatalogCategoryRules] = useState(() => { if (typeof window !== 'undefined') { try { const store = JSON.parse(localStorage.getItem('selectedStore') || localStorage.getItem('pos_selected_store') || 'null'); return JSON.parse(localStorage.getItem('pos_category_rules_' + (store?.id || store?.store_id || 'default')) || '{}'); } catch (_) {} } return {}; });
  const [catalogCategories, setCatalogCategories] = useState(() => { if (typeof window !== 'undefined') { try { const store = JSON.parse(localStorage.getItem('selectedStore') || localStorage.getItem('pos_selected_store') || 'null'); return JSON.parse(localStorage.getItem('pos_catalog_categories_' + (store?.id || store?.store_id || 'default')) || '[]'); } catch (_) {} } return []; });
  const [cart, setCart] = useState(() => { if (typeof window !== 'undefined') { try { const saved = localStorage.getItem('pos_cart'); return saved ? JSON.parse(saved) : []; } catch (_) { return []; } } return []; });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedProductForVariations, setSelectedProductForVariations] = useState(null);
  const [openAmountProduct, setOpenAmountProduct] = useState(null);
  const [customPriceInput, setCustomPriceInput] = useState('');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customItem, setCustomItem] = useState({ name: '', price: '' });
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [completedOrderForReceipt, setCompletedOrderForReceipt] = useState(null);
  const [stockWarningModal, setStockWarningModal] = useState({ show: false, product: null, variation: null, price: 0, cartItemId: null, quantityDelta: 1 });
  const [customers, setCustomers] = useState(() => { if (typeof window !== 'undefined') { try { const saved = localStorage.getItem('pos_cached_customers'); return saved ? JSON.parse(saved) : []; } catch (_) { return []; } } return []; });
  const [selectedCustomer, setSelectedCustomer] = useState(() => { if (typeof window !== 'undefined') { try { const saved = localStorage.getItem('pos_selected_customer'); return saved ? JSON.parse(saved) : null; } catch (_) { return null; } } return null; });
  const [customerSearch, setCustomerSearch] = useState('');
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [redeemedDiscount, setRedeemedDiscount] = useState(0);
  const [discountType, setDiscountType] = useState('none');
  const [discountValue, setDiscountValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [checkoutStatus, setCheckoutStatus] = useState(null);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [serverOnline, setServerOnline] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('sumup');
  const [paymentMethodByStore, setPaymentMethodByStore] = useState(() => { if (typeof window === 'undefined') return {}; try { return JSON.parse(localStorage.getItem('pos_payment_method_by_store') || '{}'); } catch (_) { return {}; } });
  const [cashGiven, setCashGiven] = useState('');
  const [showManualPinConfirm, setShowManualPinConfirm] = useState(false);
  const [pickupOrders, setPickupOrders] = useState([]);
  const [pickupCheckout, setPickupCheckout] = useState(null);
  const [loadingPickup, setLoadingPickup] = useState(false);
  const offlineSyncInFlight = useRef(null);
  const serverCheckState = useRef({ failures: 0, successes: 0, checking: false });
  const serverCheckPromise = useRef(null);
  const backgroundSyncState = useRef({ running: false, lastRun: 0 });

  useEffect(() => { if (typeof window !== 'undefined' && customers.length > 0) localStorage.setItem('pos_cached_customers', JSON.stringify(customers)); }, [customers]);
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('pos_cart', JSON.stringify(cart)); }, [cart]);
  useEffect(() => { if (typeof window !== 'undefined') { if (selectedCustomer) localStorage.setItem('pos_selected_customer', JSON.stringify(selectedCustomer)); else localStorage.removeItem('pos_selected_customer'); } }, [selectedCustomer]);
  useEffect(() => { if (typeof window !== 'undefined') localStorage.setItem('pos_active_tab', activeTab); }, [activeTab]);
  useEffect(() => {
    if (!selectedStore) return;
    const storeId = String(selectedStore.id || selectedStore.store_id || 1);
    const methods = selectedStore.payment_methods || { sumup: true, manual_pin: true, cash: true };
    const saved = paymentMethodByStore[storeId];
    const allowed = method => (method === 'sumup' && methods.sumup !== false) || (method === 'manual_pin' && methods.manual_pin !== false) || (method === 'cash' && methods.cash !== false);
    const fallback = methods.sumup !== false ? 'sumup' : methods.manual_pin !== false ? 'manual_pin' : 'cash';
    if (saved && allowed(saved)) setSelectedPaymentMethod(saved); else setSelectedPaymentMethod(fallback);
  }, [selectedStore, paymentMethodByStore]);
  const selectPaymentMethod = method => { setSelectedPaymentMethod(method); if (!selectedStore || typeof window === 'undefined') return; const storeId = String(selectedStore.id || selectedStore.store_id || 1); setPaymentMethodByStore(prev => { const next = { ...prev, [storeId]: method }; localStorage.setItem('pos_payment_method_by_store', JSON.stringify(next)); return next; }); };
  const formatAttributes = attributes => { if (!attributes || !Array.isArray(attributes) || attributes.length === 0) return ''; return attributes.map(a => `${a.name || a.slug || 'Optie'}: ${a.option || 'Standaard'}`).join(' | '); };
  const readLocalArray = (key, fallback = []) => { try { const raw = localStorage.getItem(key); if (!raw) return fallback; const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : fallback; } catch (_) { return fallback; } };
  const checkServerConnection = async (immediate = false) => {
    if (typeof window === 'undefined') return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      serverCheckState.current.failures = 3;
      serverCheckState.current.successes = 0;
      setServerOnline(false);
      localStorage.setItem('pos_server_online', '0');
      return false;
    }
    if (serverCheckPromise.current) return serverCheckPromise.current;
    serverCheckPromise.current = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch(`${window.location.origin}/api/admin/store?_pos_health=${Date.now()}`, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'X-POS-Health-Check': '1'
          }
        });
        if (res.ok) {
          let health = {};
          try { health = await res.json(); } catch (_) {}
          const online = health.online === true && health.database !== false;
          if (online) {
            serverCheckState.current.failures = 0;
            serverCheckState.current.successes += 1;
            if (immediate || serverCheckState.current.successes >= 2) setServerOnline(true);
            localStorage.setItem('pos_server_online', '1');
            return true;
          }
        }
      } catch (_) {
        // Network/timeout = server unavailable.
      } finally {
        clearTimeout(timer);
      }
      serverCheckState.current.successes = 0;
      serverCheckState.current.failures += 1;
      // During the initial login/page load, do not keep showing "online"
      // while waiting for three polling failures. A failed health check is
      // enough to establish the initial server state. During normal operation
      // we keep the existing 3-failure debounce to avoid false offline flicker.
      if (immediate || serverCheckState.current.failures >= 3) {
        setServerOnline(false);
        localStorage.setItem('pos_server_online', '0');
      }
      return false;
    })();
    try {
      return await serverCheckPromise.current;
    } finally {
      serverCheckPromise.current = null;
    }
  };
  const fetchWithServerCheck = async (url, options = {}, timeout = 10000) => { const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout); try { return await fetch(url, { ...options, cache: 'no-store', signal: controller.signal, headers: { ...(options.headers || {}), 'Cache-Control': 'no-cache, no-store, must-revalidate' } }); } finally { clearTimeout(timer); } };
  const parsePaymentMethods = pm => { let methods = { sumup: true, manual_pin: true, cash: true }; if (!pm) return methods; if (typeof pm === 'string') { try { methods = JSON.parse(pm); } catch (_) {} } else if (typeof pm === 'object') methods = { ...methods, ...pm }; return methods; };
  const handleSelectStore = (store, shouldCloseModal = true) => { if (!store) return; const parsedMethods = parsePaymentMethods(store.payment_methods); const storeData = { id: store.id || store.store_id || 1, store_id: store.id || store.store_id || 1, name: store.store_name || store.name || 'Ons Winkeltje', store_name: store.store_name || store.name || 'Ons Winkeltje', location: store.address || store.location || '', address: store.address || store.location || '', pickup_id: store.pickup_id || null, terminal_id: store.terminal_id || null, payment_methods: parsedMethods, cached_at: Date.now() }; setSelectedStore(storeData); localStorage.setItem('selectedStore', JSON.stringify(storeData)); localStorage.setItem('pos_selected_store', JSON.stringify(storeData)); if (shouldCloseModal) setShowStoreModal(false); };
  const loadOfflineCaches = () => { const cachedCustomers = readLocalArray('pos_cached_customers'); if (cachedCustomers.length) setCustomers(prev => prev.length ? prev : cachedCustomers); };
  useEffect(() => { const userStr = localStorage.getItem('pos_user'); if (!userStr) { router.replace('/login'); return; } try { setCurrentUser(JSON.parse(userStr)); } catch (_) { router.replace('/login'); return; } effectCallbacks.current.loadOfflineCaches?.(); effectCallbacks.current.checkOfflineQueue?.(); const savedStore = localStorage.getItem('selectedStore') || localStorage.getItem('pos_selected_store'); if (savedStore) { try { effectCallbacks.current.handleSelectStore?.(JSON.parse(savedStore), false); } catch (_) {} } setIsChecking(false); }, [router]);
  const triggerOfflineSync = async (isManualClick = false) => {
    if (offlineSyncInFlight.current) return offlineSyncInFlight.current;

    offlineSyncInFlight.current = (async () => {
      try {
        const savedQueue = readLocalArray('pos_offline_orders');
        setPendingOfflineCount(savedQueue.length);

        if (!savedQueue.length) {
          if (isManualClick) alert('Er staan geen offline bestellingen in de wachtrij.');
          return;
        }
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

        const getQueueIdentity = (order) => String(
          order?.clientOrderId ||
          order?.created_at ||
          `pos-${order?.storeId || 1}-${order?.cashierId || 1}-${JSON.stringify(order)}`
        ).slice(0, 128);

        let successCount = 0;
        let lastError = '';
        const syncedKeys = new Set();
        const failedOrders = new Map();

        for (const order of savedQueue) {
          const originalKey = getQueueIdentity(order);
          let queuedOrder = order;

          try {
            const clientOrderId = String(
              order.clientOrderId ||
              `pos-${order.created_at || Date.now()}-${Math.random().toString(36).slice(2, 8)}`
            ).slice(0, 128);

            if (!clientOrderId || clientOrderId === 'pos-') {
              throw new Error('Offline bestelling heeft geen geldig order-ID.');
            }

            queuedOrder = { ...order, clientOrderId };
            const res = await fetchWithServerCheck('/api/woocommerce/checkout', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Idempotency-Key': clientOrderId
              },
              body: JSON.stringify(queuedOrder)
            }, 120000);

            let data = {};
            try { data = await res.json(); } catch (_) {}

            if (res.ok && data.success) {
              syncedKeys.add(originalKey);
              successCount += 1;
            } else {
              lastError = data.error || data.message || `HTTP ${res.status}`;
              failedOrders.set(originalKey, queuedOrder);
            }
          } catch (err) {
            lastError = err.message || 'Geen verbinding met de server';
            failedOrders.set(originalKey, queuedOrder);
          }
        }

        // Merge against the latest browser queue so orders added while this
        // sync was running are never overwritten or discarded.
        const latestQueue = readLocalArray('pos_offline_orders');
        const remainingQueue = [];
        const retainedKeys = new Set();

        for (const order of latestQueue) {
          const originalKey = getQueueIdentity(order);
          if (syncedKeys.has(originalKey)) continue;

          const retainedOrder = failedOrders.get(originalKey) || order;
          const retainedKey = getQueueIdentity(retainedOrder);
          if (!retainedKeys.has(retainedKey)) {
            retainedKeys.add(retainedKey);
            remainingQueue.push(retainedOrder);
          }
        }

        // Preserve any failed item that was temporarily absent from the
        // latest snapshot; never turn a sync failure into data loss.
        for (const order of failedOrders.values()) {
          const retainedKey = getQueueIdentity(order);
          if (!retainedKeys.has(retainedKey)) {
            retainedKeys.add(retainedKey);
            remainingQueue.push(order);
          }
        }

        if (remainingQueue.length) {
          localStorage.setItem('pos_offline_orders', JSON.stringify(remainingQueue));
        } else {
          localStorage.removeItem('pos_offline_orders');
        }
        setPendingOfflineCount(remainingQueue.length);

        if (successCount > 0) {
          setCheckoutStatus({
            success: true,
            message: `✅ ${successCount} offline bestelling(en) automatisch gesynchroniseerd!`
          });
          window.dispatchEvent(new CustomEvent('pos:ajax-refresh', {
            detail: { offlineOrdersSynced: successCount }
          }));
          Promise.allSettled([
            fetchProducts(),
            fetchCustomers(),
            fetchUsersAsCustomers(),
            fetchPickupOrders(),
            fetchStores()
          ]).catch(err => console.warn('[AUTO SYNC] verversen na offline sync mislukt:', err));
        } else if (remainingQueue.length && isManualClick) {
          alert(
            `Synchroniseren van ${remainingQueue.length} offline bestelling(en) is niet gelukt. ` +
            `De bestellingen zijn veilig in de wachtrij bewaard. Foutmelding: ${lastError}`
          );
        }
      } finally {
        setIsSyncing(false);
        offlineSyncInFlight.current = null;
      }
    })();

    return offlineSyncInFlight.current;
  };
  useEffect(() => { let stopped = false; let syncTimer = null; let fullSyncTimer = null; const backgroundSync = async (force = false) => { if (stopped || backgroundSyncState.current.running) return; if (typeof navigator !== 'undefined' && navigator.onLine === false) { effectCallbacks.current.checkOfflineQueue?.(); return; } const now = Date.now(); if (!force && now - backgroundSyncState.current.lastRun < 4000) return; backgroundSyncState.current.running = true; backgroundSyncState.current.lastRun = now; try { const hasOfflineOrders = readLocalArray('pos_offline_orders').length > 0; if (hasOfflineOrders) { await effectCallbacks.current.triggerOfflineSync?.(false); } if (!stopped && !hasOfflineOrders && force && await effectCallbacks.current.checkServerConnection?.()) { await Promise.allSettled([effectCallbacks.current.fetchProducts?.(), effectCallbacks.current.fetchCustomers?.(), effectCallbacks.current.fetchUsersAsCustomers?.(), effectCallbacks.current.fetchPickupOrders?.(), effectCallbacks.current.fetchStores?.()]); } } catch (err) { console.warn('[AUTO SYNC] achtergrond-sync mislukt:', err); } finally { backgroundSyncState.current.running = false; } }; const syncOfflineQueueOnly = async () => { if (stopped) return; if (!readLocalArray('pos_offline_orders').length) return; if (typeof navigator !== 'undefined' && navigator.onLine === false) return; try { const online = await effectCallbacks.current.checkServerConnection?.(); if (online) await effectCallbacks.current.triggerOfflineSync?.(false); } catch (err) { console.warn('[AUTO OFFLINE QUEUE] sync mislukt:', err); } }; const syncAllOfflineQueues = async () => { try { await syncOfflineQueueOnly(); await effectCallbacks.current.syncOfflinePickupActions?.(); } catch (err) { console.warn('[AUTO QUEUE] sync mislukt:', err); } }; backgroundSync(true); syncTimer = setInterval(syncAllOfflineQueues, 5000); fullSyncTimer = setInterval(() => backgroundSync(true), 300000); const wake = () => { if (!document.hidden) backgroundSync(true); }; const online = () => syncAllOfflineQueues(); const offlineOrderAdded = () => { if (!stopped) syncAllOfflineQueues(); }; window.addEventListener('online', online); window.addEventListener('focus', wake); window.addEventListener('pos:offline-order-added', offlineOrderAdded); document.addEventListener('visibilitychange', wake); return () => { stopped = true; clearInterval(syncTimer); clearInterval(fullSyncTimer); window.removeEventListener('online', online); window.removeEventListener('focus', wake); window.removeEventListener('pos:offline-order-added', offlineOrderAdded); document.removeEventListener('visibilitychange', wake); }; }, []);
  useEffect(() => {
    let stopped = false;
    const pollServerStatus = async () => {
      if (stopped) return;
      const online = await effectCallbacks.current.checkServerConnection?.();
      // Server recovery is the authoritative trigger for the offline queue.
      // Do not rely only on the browser's "online" event: the internet can
      // stay online while the POS server itself was temporarily down.
      if (online && readLocalArray('pos_offline_orders').length > 0) {
        try {
          await effectCallbacks.current.triggerOfflineSync?.(false);
        } catch (err) {
          console.warn('[SERVER RECOVERY] offline queue sync mislukt:', err);
        }
      }
    };
    // Check the real POS server immediately when the POS opens. This avoids
    // showing the browser's navigator.onLine state as "server online" while
    // the actual Next.js server is unreachable.
    // Perform a real POS-server health check immediately on startup.
    // navigator.onLine only tells us that the device has internet access;
    // the health endpoint tells us whether the actual POS server is reachable.
    effectCallbacks.current.checkServerConnection?.(true);
    const timer = setInterval(pollServerStatus, 2000);
    const online = () => pollServerStatus();
    const offline = () => {
      serverCheckState.current.failures = 3;
      serverCheckState.current.successes = 0;
      setServerOnline(false);
      localStorage.setItem('pos_server_online', '0');
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, []);

  const checkOfflineQueue = () => setPendingOfflineCount(readLocalArray('pos_offline_orders').length);
  useEffect(() => {
    const refreshLocalState = event => {
      setPendingOfflineCount(readLocalArray('pos_offline_orders').length);
      const stored = localStorage.getItem('pos_selected_store') || localStorage.getItem('selectedStore');
      let storeId = String(selectedStore?.id || selectedStore?.store_id || 1);
      if (stored) {
        try {
          const savedStore = JSON.parse(stored);
          storeId = String(savedStore.id || savedStore.store_id || 1);
          setSelectedStore(savedStore);
        } catch (_) {}
      }
      if (event?.detail?.storeId && String(event.detail.storeId) !== storeId) return;
      const cached = readLocalArray('pos_cached_products_' + storeId, []);
      if (cached.length || localStorage.getItem('pos_cached_products_' + storeId)) setProducts(cached);
    };
    window.addEventListener('storage', refreshLocalState);
    window.addEventListener('pos:ajax-refresh', refreshLocalState);
    window.addEventListener('pos:inventory-synced', refreshLocalState);
    return () => {
      window.removeEventListener('storage', refreshLocalState);
      window.removeEventListener('pos:ajax-refresh', refreshLocalState);
      window.removeEventListener('pos:inventory-synced', refreshLocalState);
    };
  }, [selectedStore?.id, selectedStore?.store_id]);
  const fetchStores = async () => { try { const res = await fetchWithServerCheck('/api/admin/store', {}, 15000); const data = await res.json(); if (!res.ok || !data.success || !Array.isArray(data.stores)) throw new Error(data.error || 'Toegankelijke filialen konden niet worden opgehaald.'); const parsedStores = data.stores.map(s => ({ ...s, payment_methods: parsePaymentMethods(s.payment_methods) })); setAllStores(parsedStores); localStorage.removeItem('admin_cached_stores'); const storeStr = localStorage.getItem('selectedStore') || localStorage.getItem('pos_selected_store'); if (storeStr) { try { const savedStoreObj = JSON.parse(storeStr); const matchedCurrent = parsedStores.find(st => String(st.id || st.store_id) === String(savedStoreObj.id || savedStoreObj.store_id)); if (matchedCurrent) handleSelectStore(matchedCurrent, false); else { localStorage.removeItem('selectedStore'); localStorage.removeItem('pos_selected_store'); setSelectedStore(null); setProducts([]); setCatalogCategoryRules({}); router.replace('/select-store'); } } catch (_) { localStorage.removeItem('selectedStore'); localStorage.removeItem('pos_selected_store'); setSelectedStore(null); setProducts([]); setCatalogCategoryRules({}); router.replace('/select-store'); } } else if (parsedStores.length === 1) handleSelectStore(parsedStores[0], false); else if (!parsedStores.length) { setSelectedStore(null); setProducts([]); setCatalogCategoryRules({}); } } catch (err) { console.error('Fout bij ophalen toegankelijke filialen:', err); setAllStores([]); localStorage.removeItem('admin_cached_stores'); } };
  const handleSyncData = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      // Resolve the active branch before requesting its catalog; parallel store/product
      // requests could race and send a missing or previous store_id.
      await fetchStores();
      let storeId = selectedStore?.id || selectedStore?.store_id || null;
      try { const saved = JSON.parse(localStorage.getItem('selectedStore') || localStorage.getItem('pos_selected_store') || 'null'); storeId = saved?.id || saved?.store_id || storeId; } catch (_) {}
      if (!storeId) throw new Error('Selecteer eerst een filiaal voordat je synchroniseert.');
      const productsOk = await fetchProducts(true, String(storeId));
      if (!productsOk) throw new Error('De productcatalogus kon niet worden bijgewerkt. Controleer de verbinding met de POS-server en probeer opnieuw.');
      await Promise.allSettled([fetchCustomers(), fetchUsersAsCustomers(), fetchPickupOrders()]);
      await triggerOfflineSync(false);
      alert('Synchronisatie voltooid. Producten zijn opnieuw opgehaald voor het geselecteerde filiaal.');
    } catch (err) {
      console.error('[MANUAL SYNC] mislukt:', err);
      alert('Synchronisatie niet gelukt: ' + (err?.message || 'De POS-server of WooCommerce is tijdelijk niet bereikbaar. Je bestaande productcache is behouden.'));
    } finally { setIsSyncing(false); }
  };
  const fetchQuickStock = async (orderItems = []) => {
    const ids = [...new Set(orderItems.map(item => Number(item.product_id || item.id)).filter(id => Number.isInteger(id) && id > 0 && !String(id).startsWith('custom_')))].slice(0, 40);
    if (!ids.length) return;
    try {
      const res = await fetchWithServerCheck(`/api/woocommerce/stock?ids=${ids.join(',')}&store_id=${encodeURIComponent(selectedStore?.id || selectedStore?.store_id || 1)}`, {}, 9000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !Array.isArray(data.products)) return;
      setProducts(previous => {
        const updated = previous.map(product => {
          const fresh = data.products.find(item => Number(item.id) === Number(product.id));
          if (!fresh) return product;
          const freshVars = Array.isArray(fresh.variations_data) ? fresh.variations_data : [];
          const variationsData = (product.variations_data || []).map(variation => {
            const v = freshVars.find(item => Number(item.id) === Number(variation.id || variation.variation_id));
            return v ? { ...variation, stock_quantity: v.stock_quantity, in_stock: v.in_stock } : variation;
          });
          return { ...product, stock_quantity: fresh.stock_quantity, in_stock: fresh.in_stock, variations_data: variationsData };
        });
        try {
          localStorage.setItem('pos_cached_products_' + String(selectedStore?.id || selectedStore?.store_id || 1), JSON.stringify(updated));
          localStorage.setItem('admin_products', JSON.stringify(updated));
          localStorage.setItem('pos_cached_products_updated_at_' + String(selectedStore?.id || selectedStore?.store_id || 1), String(Date.now()));
        } catch (_) {}
        return updated;
      });
      window.dispatchEvent(new CustomEvent('pos:inventory-synced', { detail: { quick: true, products: data.products, storeId: String(selectedStore?.id || selectedStore?.store_id || 1) } }));
    } catch (err) {
      console.warn('[QUICK STOCK SYNC] voorraad blijft uit cache tot volgende sync:', err);
    }
  };
  const fetchProducts = async (requireFresh = false, requestedStoreId = null) => {
    const storedSelection = (() => { try { return JSON.parse(localStorage.getItem('selectedStore') || localStorage.getItem('pos_selected_store') || 'null'); } catch (_) { return null; } })();
    const selectedId = requestedStoreId || selectedStore?.id || selectedStore?.store_id || storedSelection?.id || storedSelection?.store_id;
    if (!selectedId) {
      setProducts([]);
      setCatalogCategoryRules({});
      setCatalogCategories([]);
      return false;
    }
    const storeId = String(selectedId);
    const cacheKey = 'pos_cached_products_' + storeId;
    // Never fall back to the old shared cache: it may contain products excluded
    // for another branch. Only this branch's own cache is safe to display.
    const cached = readLocalArray(cacheKey, []);
    if (cached.length || localStorage.getItem(cacheKey)) setProducts(cached);
    let cachedCategories = [];
    try {
      cachedCategories = JSON.parse(localStorage.getItem('pos_catalog_categories_' + storeId) || '[]');
      if (!Array.isArray(cachedCategories)) cachedCategories = [];
      setCatalogCategories(cachedCategories);
    } catch (_) { setCatalogCategories([]); }
    // Reuse a recently synchronized branch catalog after reload only when
    // its category tree is also cached. Older product-only caches must refresh
    // once so the top-level category buttons can be reconstructed.
    const cacheTimeKey = 'pos_cached_products_updated_at_' + storeId;
    const cachedAt = Number(localStorage.getItem(cacheTimeKey) || 0);
    const cacheIsFresh = cached.length > 0 && cachedAt > 0 && Date.now() - cachedAt < 2 * 60 * 1000;
    if (!requireFresh && cacheIsFresh && cachedCategories.length > 0) return true;
    try {
      const params = new URLSearchParams({ store_id: storeId });
      // Normal page loads may use the warm server-side WooCommerce cache.
      // Only an explicit manual sync should force a fresh upstream request.
      if (requireFresh) params.set('refresh', '1');
      const res = await fetchWithServerCheck('/api/woocommerce/products?' + params.toString(), {}, requireFresh ? 90000 : 30000);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !Array.isArray(data.products) || data.stale) throw new Error(data.error || 'Product-sync mislukt.');
      setProducts(data.products);
      setCatalogCategoryRules(data.categoryRules || {});
      const receivedCategories = Array.isArray(data.catalogCategories) ? data.catalogCategories.map(category => ({ ...category, id: String(category.id), parent: String(category.parent || 0) })) : [];
      setCatalogCategories(receivedCategories);
      localStorage.setItem('pos_catalog_categories_' + storeId, JSON.stringify(receivedCategories));
      localStorage.setItem(cacheKey, JSON.stringify(data.products));
      localStorage.setItem(cacheTimeKey, String(Date.now()));
      localStorage.setItem('pos_category_rules_' + storeId, JSON.stringify(data.categoryRules || {}));
      localStorage.setItem('admin_products', JSON.stringify(data.products));
      window.dispatchEvent(new CustomEvent('pos:inventory-synced', { detail: { products: data.products, storeId } }));
      return true;
    } catch (err) {
      console.warn('[PRODUCTS] Server niet bereikbaar; lokale productcache behouden.', err);
      if (requireFresh) throw err;
      return false;
    }
  };
  useEffect(() => {
    if (selectedStore?.id || selectedStore?.store_id) { setSelectedCategory('ALL'); effectCallbacks.current.fetchProducts?.(false); }
  }, [selectedStore?.id, selectedStore?.store_id]);

  const fetchCustomers = async () => { try { const res = await fetchWithServerCheck('/api/woocommerce/customers'); const data = await res.json(); if (data.success && data.customers) { setCustomers(data.customers); localStorage.setItem('pos_cached_customers', JSON.stringify(data.customers)); } } catch (err) { console.error('Fout bij ophalen klanten:', err); } };
  const fetchUsersAsCustomers = async () => { try { const res = await fetchWithServerCheck('/api/admin/users'); const data = await res.json(); if (data.success && data.users) { const staffAsCustomers = data.users.map(u => ({ id: `user_${u.id}`, username: u.username || '', user_login: u.username || '', first_name: u.username || '', last_name: u.role ? `(${u.role})` : '(Gebruiker)', email: u.email || `${u.username}@bendemen.local` })); setCustomers(prev => { const existingIds = new Set(prev.map(c => String(c.id))); const merged = [...prev, ...staffAsCustomers.filter(s => !existingIds.has(String(s.id)))]; localStorage.setItem('pos_cached_customers', JSON.stringify(merged)); return merged; }); } } catch (err) { console.error('Fout bij ophalen gebruikers:', err); } };
  const fetchPickupOrders = async () => { const storeId = String(selectedStore?.id || selectedStore?.store_id || 1); const pickupId = selectedStore?.pickup_id ? String(selectedStore.pickup_id) : ''; const cacheKey = 'pos_cached_pickup_orders_' + storeId; const cached = readLocalArray(cacheKey); setPickupOrders(cached); try { setLoadingPickup(true); const params = new URLSearchParams({ store_id: storeId }); if (pickupId) params.set('pickup_id', pickupId); const res = await fetchWithServerCheck('/api/woocommerce/pickup-order?' + params.toString(), {}, 35000); const data = await res.json().catch(() => ({})); if (!res.ok || !data.success || !Array.isArray(data.orders)) throw new Error(data.error || 'Afhaalbestellingen ophalen mislukt.'); const orders = data.orders; setPickupOrders(orders); localStorage.setItem(cacheKey, JSON.stringify(orders)); } catch (err) { console.warn('[PICKUP] Server niet bereikbaar; filiaalcache behouden.', err); } finally { setLoadingPickup(false); } };
  const syncOfflinePickupActions = async () => { const queue = readLocalArray('pos_offline_pickup_actions'); if (!queue.length || (typeof navigator !== 'undefined' && navigator.onLine === false)) return; const remaining = []; for (const action of queue) { try { const res = await fetchWithServerCheck('/api/woocommerce/pickup-order', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: action.orderId, status: action.status || 'completed', payment_method: action.paymentMethod || 'cash' }) }, 90000); const data = await res.json().catch(() => ({})); if (!(res.ok && data.success)) remaining.push(action); } catch (_) { remaining.push(action); } } if (remaining.length) localStorage.setItem('pos_offline_pickup_actions', JSON.stringify(remaining)); else localStorage.removeItem('pos_offline_pickup_actions'); if (!remaining.length) await fetchPickupOrders(); };
  const handleMarkAsPickedUp = async (orderId, paymentMethod) => { const method = paymentMethod === 'manual_pin' ? 'manual_pin' : 'cash'; setPickupCheckout(null); setPickupOrders(prev => prev.filter(o => o.id !== orderId)); try { const res = await fetchWithServerCheck('/api/woocommerce/pickup-order', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId, status: 'completed', payment_method: method }) }, 90000); const data = await res.json().catch(() => ({})); if (res.ok && data.success) { localStorage.setItem('pos_cached_pickup_orders_' + String(selectedStore?.id || selectedStore?.store_id || 1), JSON.stringify(pickupOrders.filter(o => o.id !== orderId))); alert(`Bestelling #${orderId} is afgerekend en afgerond.`); } else throw new Error(data.error || 'Onbekende fout'); } catch (err) { const queue = readLocalArray('pos_offline_pickup_actions'); if (!queue.some(a => String(a.orderId) === String(orderId))) queue.push({ orderId, status: 'completed', paymentMethod: method, timestamp: new Date().toISOString() }); localStorage.setItem('pos_offline_pickup_actions', JSON.stringify(queue)); localStorage.setItem('pos_cached_pickup_orders_' + String(selectedStore?.id || selectedStore?.store_id || 1), JSON.stringify(pickupOrders.filter(o => o.id !== orderId))); alert(`⚠️ Server niet bereikbaar. Bestelling #${orderId} blijft in de wachtrij en wordt automatisch afgerekend.`); } };
  const handleLogout = () => { localStorage.removeItem('pos_user'); localStorage.removeItem('pos_token'); localStorage.removeItem('pos_cart'); localStorage.removeItem('pos_selected_customer'); localStorage.removeItem('selectedStore'); localStorage.removeItem('pos_selected_store'); localStorage.removeItem('admin_cached_stores'); router.replace('/login'); };
  const getProductCategory = product => {
    const assigned = Array.isArray(product.categories) ? product.categories.filter(category => category && category.id != null) : [];
    if (!assigned.length) return 'Overige';
    const primaryId = Number(product.primary_category_id || product.primary_category?.id || 0);
    // Category priority is the explicit POS rule: the highest priority wins.
    // WooCommerce's primary category is only a tie-breaker when priorities match.
    return [...assigned].sort((a, b) => {
      const priorityA = Number(catalogCategoryRules[String(a.id)]?.priority) || 0;
      const priorityB = Number(catalogCategoryRules[String(b.id)]?.priority) || 0;
      return priorityB - priorityA ||
        (Number(b.id) === primaryId ? 1 : 0) - (Number(a.id) === primaryId ? 1 : 0) ||
        String(a.name || '').localeCompare(String(b.name || ''));
    })[0]?.name || 'Overige';
  };
  // Server applies this branch's exclusions; legacy name-based filters caused incorrect hiding.
  const activeProducts = products;
  const categoryById = new Map(catalogCategories.map(category => [String(category.id), category]));
  const childCategoryIds = new Map();
  catalogCategories.forEach(category => {
    const parentId = String(category.parent || '0');
    if (!childCategoryIds.has(parentId)) childCategoryIds.set(parentId, []);
    childCategoryIds.get(parentId).push(String(category.id));
  });
  const getCategoryTreeIds = categoryId => {
    const result = [String(categoryId)];
    const visited = new Set(result);
    for (let index = 0; index < result.length; index += 1) {
      (childCategoryIds.get(result[index]) || []).forEach(childId => {
        if (!visited.has(childId)) { visited.add(childId); result.push(childId); }
      });
    }
    return result;
  };
  const getAssignedCategoryIds = product => {
    const ids = (Array.isArray(product.categories) ? product.categories : [])
      .map(category => String(category?.id ?? category))
      .filter(id => id && id !== 'undefined' && id !== 'null');
    const primaryId = product.primary_category_id || product.primary_category?.id;
    if (primaryId) ids.push(String(primaryId));
    return [...new Set(ids)];
  };
  const topLevelCategories = catalogCategories.filter(category => {
    const parentId = String(category.parent || '0');
    return parentId === '0' || !categoryById.has(parentId);
  });
  const categoriesFromTree = topLevelCategories
    .map(category => {
      const treeIds = new Set(getCategoryTreeIds(category.id));
      const categoryRule = catalogCategoryRules[String(category.id)];
      const count = categoryRule?.excluded === true
        ? 0
        : activeProducts.filter(product => getAssignedCategoryIds(product).some(id => treeIds.has(id))).length;
      return { id: String(category.id), name: category.name || 'Categorie', count };
    })
    .filter(category => category.count > 0);

  // Never infer a category's parent from product assignments: products only
  // carry category IDs/names, not the hierarchy. If the full WooCommerce tree
  // is unavailable, keep the category bar empty until refresh rather than
  // accidentally exposing every subcategory as a top-level button.
  const categoriesList = categoriesFromTree.sort((a, b) =>
    (Number(catalogCategoryRules[String(b.id)]?.priority) || 0) - (Number(catalogCategoryRules[String(a.id)]?.priority) || 0) ||
    a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  );
  const handleProductClick = product => { const productVariations = Array.isArray(product.variations_data) && product.variations_data.length ? product.variations_data : (Array.isArray(product.variations) && typeof product.variations[0] === 'object' ? product.variations : []); if (productVariations.length) { setSelectedProductForVariations({ ...product, variations_data: productVariations }); return; } const stock = product.stock_quantity; const price = parseFloat(product.price || 0); if (stock !== null && stock !== undefined && Number(stock) <= 0) { setStockWarningModal({ show: true, product, variation: null, price, cartItemId: null, quantityDelta: 1 }); return; } if (product.price === '' || product.price === null || (price === 0 && !product.is_fixed_zero)) { setOpenAmountProduct(product); setCustomPriceInput(''); return; } addToCart(product, price); };
  const handleConfirmOpenAmount = () => { const price = parseFloat(customPriceInput); if (isNaN(price) || price < 0) { alert('Voer een geldig bedrag in (0 of hoger).'); return; } const stock = openAmountProduct.stock_quantity; if (stock !== null && stock !== undefined && Number(stock) <= 0) { setStockWarningModal({ show: true, product: openAmountProduct, variation: null, price }); setOpenAmountProduct(null); setCustomPriceInput(''); return; } const openAmountId = `${openAmountProduct.id}_open_${price.toFixed(2)}`; addToCartCustom({ ...openAmountProduct, id: openAmountId, product_id: openAmountProduct.id, variation_id: 0, price, name: openAmountProduct.name, is_open_amount: true }); setOpenAmountProduct(null); setCustomPriceInput(''); };
  const handleAddCustomItem = () => { if (!customItem.name || customItem.price === '') { alert('Vul aub een naam en bedrag in.'); return; } const price = parseFloat(customItem.price); if (isNaN(price) || price < 0) { alert('Voer een geldig bedrag in.'); return; } addToCartCustom({ id: `custom_${Date.now()}`, product_id: 0, variation_id: 0, name: customItem.name, price, quantity: 1 }); setCustomItem({ name: '', price: '' }); setShowCustomModal(false); };
  const handleSelectVariation = variation => { const price = parseFloat(variation.price || selectedProductForVariations.price || 0); if (variation.stock_quantity !== null && variation.stock_quantity !== undefined && Number(variation.stock_quantity) <= 0) { setSelectedProductForVariations(null); setStockWarningModal({ show: true, product: selectedProductForVariations, variation, price, cartItemId: null, quantityDelta: 1 }); return; } const attr = formatAttributes(variation.attributes) || `Variatie #${variation.id}`; addToCartCustom({ ...selectedProductForVariations, ...variation, id: `${selectedProductForVariations.id}_var_${variation.id}`, product_id: selectedProductForVariations.id, variation_id: variation.id, name: `${selectedProductForVariations.name} - ${attr}`, price }); setSelectedProductForVariations(null); };
  const handleConfirmStockWarning = () => { const { product, variation, price, cartItemId, quantityDelta = 1 } = stockWarningModal; if (cartItemId) { setCart(prev => prev.map(item => item.id === cartItemId ? { ...item, quantity: item.quantity + quantityDelta } : item)); } else if (variation) { const attr = formatAttributes(variation.attributes) || `Variatie #${variation.id}`; addToCartCustom({ ...product, ...variation, id: `${product.id}_var_${variation.id}`, product_id: product.id, variation_id: variation.id, name: `${product.name} - ${attr}`, price }, true); } else { const isOpenAmount = product?.price === '' || product?.price === null || (parseFloat(product?.price || 0) === 0 && !product?.is_fixed_zero); if (isOpenAmount) { const openAmountId = `${product.id}_open_${Number(price || 0).toFixed(2)}`; addToCartCustom({ ...product, id: openAmountId, product_id: product.id, variation_id: 0, price: Number(price || 0), name: product.name, is_open_amount: true }, true); } else addToCart(product, price, true); } setStockWarningModal({ show: false, product: null, variation: null, price: 0, cartItemId: null, quantityDelta: 1 }); };
  const getStockLimit = item => { const stock = item?.stock_quantity; if (stock === null || stock === undefined || stock === '') return null; const parsed = Number(stock); return Number.isFinite(parsed) ? parsed : null; };
  const addToCart = (product, overridePrice = null, bypassStockWarning = false) => { const finalPrice = overridePrice !== null ? overridePrice : parseFloat(product.price || 0); setCart(prev => { const existing = prev.find(item => item.id === product.id); const currentQuantity = existing?.quantity || 0; const stockLimit = getStockLimit(product); if (!bypassStockWarning && stockLimit !== null && currentQuantity + 1 > stockLimit) { setStockWarningModal({ show: true, product, variation: null, price: finalPrice, cartItemId: existing?.id || null, quantityDelta: 1 }); return prev; } if (existing) return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item); return [...prev, { ...product, price: finalPrice, quantity: 1, product_id: product.id, variation_id: 0 }]; }); };
  const addToCartCustom = (cartItem, bypassStockWarning = false) => { setCart(prev => { const existing = prev.find(item => item.id === cartItem.id); const currentQuantity = existing?.quantity || 0; const stockLimit = getStockLimit(cartItem); if (!bypassStockWarning && stockLimit !== null && currentQuantity + 1 > stockLimit) { setStockWarningModal({ show: true, product: cartItem, variation: cartItem.variation_id ? cartItem : null, price: Number(cartItem.price || 0), cartItemId: existing?.id || null, quantityDelta: 1 }); return prev; } if (existing) return prev.map(item => item.id === cartItem.id ? { ...item, quantity: item.quantity + 1 } : item); return [...prev, { ...cartItem, quantity: 1 }]; }); };
  const updateQuantity = (id, delta) => setCart(prev => { const item = prev.find(entry => entry.id === id); if (!item) return prev; if (delta > 0) { const stockLimit = getStockLimit(item); if (stockLimit !== null && item.quantity + delta > stockLimit) { setStockWarningModal({ show: true, product: item, variation: item.variation_id ? item : null, price: Number(item.price || 0), cartItemId: id, quantityDelta: delta }); return prev; } } return prev.map(entry => entry.id === id ? { ...entry, quantity: entry.quantity + delta } : entry).filter(entry => entry.quantity > 0); });
  const subtotal = cart.reduce((acc, item) => acc + parseFloat(item.price || 0) * item.quantity, 0);
  let manualDiscountAmount = 0; if (discountType === 'percentage') manualDiscountAmount = subtotal * parseFloat(discountValue || 0) / 100; else if (discountType === 'fixed') manualDiscountAmount = parseFloat(discountValue || 0);
  const totalDiscount = Math.min(subtotal, manualDiscountAmount + parseFloat(redeemedDiscount || 0)); const finalTotal = Math.max(0, subtotal - totalDiscount); const cashGivenFloat = parseFloat(cashGiven) || 0; const changeDue = Math.max(0, cashGivenFloat - finalTotal);
  const handleRedeemPoints = async () => { const pts = parseInt(pointsToRedeem) || 0; if (pts <= 0) { setRedeemedDiscount(0); return; } if (!selectedCustomer) { alert('Koppel eerst een klant voordat je punten kunt inwisselen.'); return; } try { const res = await fetchWithServerCheck('/api/woocommerce/points', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerId: selectedCustomer.id, pointsToRedeem: pts, action: 'redeem' }) }); const data = await res.json(); if (data.success) setRedeemedDiscount(data.discountAmount); else alert(data.message || 'Fout bij inwisselen punten.'); } catch (_) { setRedeemedDiscount((pts * 0.05).toFixed(2)); } };
  const handleOpenPaymentModal = () => { if (!cart.length) { alert('Winkelmand is leeg.'); return; } const methods = selectedStore?.payment_methods || { sumup: true, manual_pin: true, cash: true }; const storeId = String(selectedStore?.id || selectedStore?.store_id || 1); let validMethod = paymentMethodByStore[storeId] || selectedPaymentMethod; const valid = (validMethod === 'sumup' && methods.sumup !== false) || (validMethod === 'manual_pin' && methods.manual_pin !== false) || (validMethod === 'cash' && methods.cash !== false); if (!valid) validMethod = methods.sumup !== false ? 'sumup' : methods.manual_pin !== false ? 'manual_pin' : 'cash'; setSelectedPaymentMethod(validMethod); setCashGiven(finalTotal.toFixed(2)); setShowPaymentModal(true); };
  const triggerPrintReceipt = async orderData => { try { const response = await fetchWithServerCheck('/api/pos/print-receipt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(orderData) }); if (!response.ok) throw new Error(`Printserver HTTP ${response.status}`); const html = await response.text(); const printWindow = window.open('', '_blank', 'width=400,height=600'); if (!printWindow) { alert('Sta pop-ups toe om de bon te kunnen printen.'); return; } printWindow.document.write(html); printWindow.document.close(); printWindow.focus(); setTimeout(() => { try { printWindow.print(); } catch (_) {} }, 250); } catch (err) { console.error('Fout bij afdrukken van bon:', err); alert('Bon printen mislukt: ' + (err.message || 'onbekende fout')); } };
  const handleReceiptChoice = async print => { const receipt = completedOrderForReceipt; setCompletedOrderForReceipt(null); if (print && receipt) await triggerPrintReceipt(receipt); };
  const processSumUpPayment = async (amount, storeId) => { const res = await fetchWithServerCheck('/api/sumup/proxy?action=pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ totalAmount: amount, storeId }) }); const data = await res.json(); if (!res.ok || !data.success) throw new Error(data.error || 'SumUp weigert de betaling.'); return data; };
  const handleInitiatePayment = () => { if (selectedPaymentMethod === 'cash' && cashGivenFloat < finalTotal) { alert('Het ingegeven contante bedrag is lager dan het totaalbedrag.'); return; } if (selectedPaymentMethod === 'sumup' && finalTotal < 1) { alert('❌ SumUp betalingen moeten minimaal €1,00 zijn.'); return; } if (selectedPaymentMethod === 'manual_pin') { setShowPaymentModal(false); setShowManualPinConfirm(true); return; } executeCheckout(); };
  const executeCheckout = async () => {
    setShowPaymentModal(false);
    setShowManualPinConfirm(false);
    setLoading(true);
    setCheckoutStatus(null);

    if (selectedPaymentMethod === 'sumup') {
      try {
        await processSumUpPayment(finalTotal.toFixed(2), selectedStore?.id || selectedStore?.store_id || 1);
      } catch (sumupErr) {
        alert(`❌ SumUp Betaling Mislukt:\n\n${sumupErr.message}\n\nDe bestelling is GEANNULEERD en niet aangemaakt.`);
        setLoading(false);
        return;
      }
    }

    // Keep the same idempotency ID when the previous checkout may have
    // reached WooCommerce but the POS did not receive the final response.
    // This is especially important for DHL/open-amount orders, where the
    // WooCommerce request can take longer than usual.
    const pendingCheckoutKey = 'pos_pending_checkout';
    let pendingCheckout = null;
    try {
      const savedPending = localStorage.getItem(pendingCheckoutKey);
      if (savedPending) pendingCheckout = JSON.parse(savedPending);
    } catch (_) {}

    const createOrderId = () => `pos-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const orderPayloadBase = {
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
      cashDetails: selectedPaymentMethod === 'cash'
        ? { cashGiven: cashGivenFloat.toFixed(2), changeDue: changeDue.toFixed(2) }
        : null
    };

    const orderFingerprint = payload => {
      const { created_at: _createdAt, clientOrderId: _clientOrderId, ...businessPayload } = payload || {};
      return JSON.stringify(businessPayload);
    };

    const samePendingOrder = pendingCheckout?.orderPayload &&
      orderFingerprint(pendingCheckout.orderPayload) === orderFingerprint(orderPayloadBase);

    const clientOrderId = samePendingOrder
      ? String(pendingCheckout.clientOrderId).slice(0, 128)
      : createOrderId();

    const orderPayload = {
      ...orderPayloadBase,
      created_at: samePendingOrder
        ? String(pendingCheckout.orderPayload.created_at || new Date().toISOString())
        : new Date().toISOString(),
      clientOrderId
    };

    let preserveCartOnCheckoutError = false;
    try {
      // Give the direct checkout enough time to finish the WooCommerce call.
      // The backend itself allows up to 15s for WooCommerce, plus its
      // idempotency/existing-order checks.
      const res = await fetchWithServerCheck('/api/woocommerce/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': clientOrderId
        },
        body: JSON.stringify(orderPayload)
      }, 95000);

      let data = {};
      try { data = await res.json(); } catch (_) {}

      if (res.ok && data.success) {
        localStorage.removeItem(pendingCheckoutKey);
        setServerOnline(true);
        localStorage.setItem('pos_server_online', '1');
        const changeText = selectedPaymentMethod === 'cash' && changeDue > 0
          ? ` (Wisselgeld: €${changeDue.toFixed(2)})`
          : '';
        setCheckoutStatus({ success: true, message: `Bestelling direct verwerkt.${changeText}` });
      } else {
        const serverError = new Error(data.error || data.message || `Server retourneerde HTTP ${res.status}`);
        serverError.isServerResponse = true;
        serverError.retryable = data.retryable === true || res.status === 503 || res.status === 409;
        throw serverError;
      }
    } catch (err) {
      const changeText = selectedPaymentMethod === 'cash' && changeDue > 0
        ? ` (Wisselgeld: €${changeDue.toFixed(2)})`
        : '';

      if (err?.isServerResponse && !err.retryable) {
        // Preserve items after an HTTP checkout error so the cashier can inspect/retry.
        preserveCartOnCheckoutError = true;
        // Keep the exact checkout ID for a manual retry. The server may have
        // created the WooCommerce order before returning an error/timeout.
        try {
          localStorage.setItem(pendingCheckoutKey, JSON.stringify({
            clientOrderId,
            orderPayload
          }));
        } catch (_) {}
        // HTTP responses prove the POS server is reachable. Do not put a
        // genuine application error into the offline queue.
        setServerOnline(true);
        localStorage.setItem('pos_server_online', '1');
        setCheckoutStatus({
          success: false,
          message: `❌ Er is iets fout gegaan. Probeer de bestelling zo opnieuw af te rekenen. Kom je er niet uit? Haal iemand zoals de manager of iemand van de technische dienst.${changeText}`
        });
      } else {
        // A timeout/network failure is immediately placed in the offline queue.
        // Do not wait for a separate health check first: the WooCommerce request
        // may have reached the server even though the POS timed out. The same
        // clientOrderId makes the later automatic retry idempotent.
        try {
          localStorage.setItem(pendingCheckoutKey, JSON.stringify({
            clientOrderId,
            orderPayload
          }));
        } catch (_) {}
        const offlineQueue = readLocalArray('pos_offline_orders');
        // Never enqueue the same clientOrderId twice.
        const alreadyQueued = offlineQueue.some(order => String(order.clientOrderId || '') === clientOrderId);
        if (!alreadyQueued) {
          offlineQueue.push(orderPayload);
          localStorage.setItem('pos_offline_orders', JSON.stringify(offlineQueue));
        }
        setPendingOfflineCount(offlineQueue.length);
        window.dispatchEvent(new CustomEvent('pos:offline-order-added'));
        setCheckoutStatus({
          success: true,
          message: `⚠️ Server is Offline, Bestelling wordt automatisch verwerkt. U kunt gewoon doorgaan.${changeText}`
        });
      }
    } finally {
      if (!preserveCartOnCheckoutError) {
      setCompletedOrderForReceipt({
        order: orderPayload,
        store: selectedStore,
        cashier: currentUser,
        paymentDetails: {
          method: selectedPaymentMethod,
          cashGiven: selectedPaymentMethod === 'cash' ? cashGivenFloat : null,
          changeDue: selectedPaymentMethod === 'cash' ? changeDue : null
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

      // Start post-purchase sync immediately over AJAX. Do not wait for a
      // health-check round trip: the checkout request just proved the API was
      // reachable (or the order was safely queued below). Keep this work
      // detached from the checkout UI so the cashier never needs a reload.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        checkOfflineQueue();
      } else {
        triggerOfflineSync(false).catch(err =>
          console.warn('[POST-PURCHASE SYNC] offline queue:', err)
        );
        // Fast, targeted stock sync only for products sold in this checkout.
        // The full catalog sync remains on its existing background schedule.
        fetchQuickStock(orderPayload.orderItems).finally(() => {
          window.dispatchEvent(new CustomEvent('pos:ajax-refresh', {
            detail: { postPurchaseSync: true, quickStockSync: true }
          }));
        });
        // Keep non-stock refreshes detached from checkout completion.
        Promise.allSettled([fetchCustomers(), fetchUsersAsCustomers(), fetchPickupOrders(), fetchStores()])
          .catch(err => console.warn('[POST-PURCHASE SYNC] secondary refresh:', err));
      }
      } else {
        setLoading(false);
      }
    }
  };
  const storeDisplayName = selectedStore?.store_name || selectedStore?.name || 'Selecteer Filiaal';
  const filteredPickupOrders = pickupOrders.filter(order => !selectedStore?.pickup_id || order.shipping_lines?.some(s => s.meta_data?.some(m => m.key === 'pickup_location_id' && m.value === String(selectedStore.pickup_id))));
  const filteredProducts = selectedStore ? activeProducts.filter(p => {
    const matchesSearch = String(p.name || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch || selectedCategory === 'ALL') return matchesSearch;
    // A product may belong to several WooCommerce categories. Match the
    // selected category against every assigned category, not only its
    // single display/primary category.
    const selectedTreeIds = new Set(getCategoryTreeIds(selectedCategory));
    return getAssignedCategoryIds(p).some(categoryId => selectedTreeIds.has(categoryId));
  }) : [];
  const filteredCustomers = customers.filter(c => `${c.first_name || ''} ${c.last_name || ''} ${c.email || ''} ${c.username || ''} ${c.user_login || ''} ${c.login || ''}`.toLowerCase().includes(customerSearch.toLowerCase()));
  if (isChecking || !currentUser) return <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4"><div className="text-center space-y-2"><h1 className="text-white font-black text-xl tracking-wider">BDM POS</h1><div className="text-red-600 font-bold text-xs uppercase tracking-widest animate-pulse">Sessie controleren...</div></div></div>;
  const paymentMethods = selectedStore?.payment_methods || { sumup: true, manual_pin: true, cash: true };
  // Long-lived effects read current callbacks without restarting timers on every render.
  effectCallbacks.current = { checkOfflineQueue, handleSelectStore, loadOfflineCaches, triggerOfflineSync, checkServerConnection, fetchProducts, fetchCustomers, fetchUsersAsCustomers, fetchPickupOrders, fetchStores, syncOfflinePickupActions };

  return (<div className="min-h-screen bg-gray-100 flex flex-col relative"><header className="bg-black text-white p-3 sm:p-4 flex flex-col md:flex-row justify-between items-center gap-3 shadow-md z-10"><div className="flex flex-wrap items-center gap-2 justify-center md:justify-start w-full md:w-auto"><span className="font-bold text-lg sm:text-xl tracking-wider">BDM POS</span><button onClick={() => setShowStoreModal(true)} className="text-xs bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 rounded font-bold uppercase flex items-center space-x-1 shadow-sm transition"><span>📍</span><span className="truncate max-w-[120px] sm:max-w-none">{storeDisplayName}</span></button>{currentUser && <span className="text-[11px] sm:text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded">{currentUser.username} ({currentUser.role})</span>}<span className={`text-[10px] font-bold px-2 py-1 rounded ${serverOnline ? 'bg-green-600' : 'bg-gray-700'}`}>{serverOnline ? '● SERVER ONLINE' : '● LOKALE MODUS'}</span>{pendingOfflineCount > 0 && <button onClick={() => triggerOfflineSync(true)} title="Klik om direct te synchroniseren of te wissen" className="text-[10px] bg-yellow-500 hover:bg-yellow-400 text-black font-extrabold px-2.5 py-1 rounded-full transition flex items-center space-x-1 shadow animate-pulse cursor-pointer"><span>⚠️ {pendingOfflineCount} Offline</span></button>}</div><div className="flex flex-wrap items-center gap-2 justify-center md:justify-end w-full md:w-auto"><button onClick={() => setActiveTab('pos')} className={`px-3 py-1.5 rounded text-xs font-bold transition ${activeTab === 'pos' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>🛒 Kassa</button><button onClick={() => { setActiveTab('pickup'); fetchPickupOrders(); }} className={`px-3 py-1.5 rounded text-xs font-bold transition flex items-center space-x-1 ${activeTab === 'pickup' ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>📦 Afhaalbalie {filteredPickupOrders.length > 0 && <span className="bg-white text-black px-1.5 py-0.2 rounded-full text-[10px] font-bold">{filteredPickupOrders.length}</span>}</button><button onClick={handleSyncData} disabled={isSyncing} className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded text-xs font-semibold transition">{isSyncing ? '⏳ Syncing...' : '🔄 Sync'}</button>{(currentUser.role === 'admin' || currentUser.role === 'super_admin') && <Link href="/admin"><button className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded text-xs font-semibold transition">⚙️ Admin</button></Link>}<button onClick={handleLogout} className="bg-red-700 hover:bg-red-800 text-white px-3 py-1.5 rounded text-xs font-semibold transition">🚪 Loguit</button></div></header>{activeTab === 'pickup' ? (<div className="flex-1 p-3 sm:p-6 max-w-6xl mx-auto w-full"><div className="bg-white rounded-lg shadow p-4 sm:p-6 space-y-4"><div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b"><div><h2 className="text-base sm:text-lg font-bold">📦 Lokale Afhaalbestellingen</h2><p className="text-xs text-gray-500">Overzicht gekoppeld aan: <span className="font-bold text-red-600">{storeDisplayName}</span></p></div><button onClick={fetchPickupOrders} disabled={loadingPickup} className="bg-black hover:bg-gray-800 text-white text-xs font-bold px-4 py-2 rounded transition w-full sm:w-auto">{loadingPickup ? '⏳ Laden...' : '🔄 Verversen'}</button></div><div className="overflow-x-auto -mx-4 sm:mx-0"><table className="w-full text-left text-xs divide-y min-w-[600px]"><thead><tr className="bg-gray-50"><th className="p-3">Order ID</th><th className="p-3">Klant</th><th className="p-3">Afhaallocatie</th><th className="p-3">Artikelen</th><th className="p-3">Totaal</th><th className="p-3 text-right">Actie</th></tr></thead><tbody className="divide-y">{filteredPickupOrders.length === 0 ? <tr><td colSpan="6" className="p-8 text-center text-gray-400">{loadingPickup ? 'Bestellingen ophalen...' : 'Geen openstaande afhaalbestellingen voor deze locatie.'}</td></tr> : filteredPickupOrders.map(order => { const shipping = order.shipping_lines?.[0]; const location = shipping?.meta_data?.find(m => m.key === 'Pickup Location' || m.key === 'location')?.value || shipping?.method_title || 'Lokale Afhaling'; return <tr key={order.id} className="hover:bg-gray-50"><td className="p-3 font-bold">#{order.number || order.id}</td><td className="p-3 font-medium">{order.billing?.first_name} {order.billing?.last_name}<div className="text-[10px] text-gray-400">{order.billing?.email}</div></td><td className="p-3 text-gray-700 font-semibold">📍 {location}</td><td className="p-3 text-gray-600 max-w-xs truncate">{order.line_items?.map(item => `${item.quantity}x ${item.name}`).join(', ')}</td><td className="p-3 font-bold text-red-600">€{parseFloat(order.total || 0).toFixed(2)}</td><td className="p-3 text-right"><button onClick={() => setPickupCheckout(order)} className="bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-2 rounded text-xs uppercase shadow-sm">Afrekenen</button></td></tr>; })}</tbody></table></div></div></div>) : (<div className="flex-1 flex flex-col lg:flex-row p-3 sm:p-4 gap-4 overflow-hidden"><div className="w-full lg:w-3/5 flex flex-col bg-white rounded-lg shadow p-3 sm:p-4"><div className="flex space-x-2 mb-3"><input type="text" placeholder="Zoek producten op naam..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="flex-1 p-2.5 sm:p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-black text-sm"/><button onClick={() => setShowCustomModal(true)} className="bg-black hover:bg-gray-800 text-white font-bold px-3 py-2 rounded text-xs whitespace-nowrap transition">+ Custom</button></div><div className="flex space-x-2 overflow-x-auto pb-3 mb-3 border-b no-scrollbar"><button onClick={() => setSelectedCategory('ALL')} className={`px-3 sm:px-4 py-2 rounded text-xs font-bold whitespace-nowrap transition ${selectedCategory === 'ALL' ? 'bg-black text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}>📦 Alles ({activeProducts.length})</button>{categoriesList.map(cat => <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`px-3 sm:px-4 py-2 rounded text-xs font-bold whitespace-nowrap transition ${selectedCategory === cat.id ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}>{cat.name} ({cat.count})</button>)}</div><div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3 max-h-[calc(100vh-280px)]">{filteredProducts.map(product => { const imageUrl = product.images?.length ? product.images[0].src : null; const vars = Array.isArray(product.variations_data) && product.variations_data.length ? product.variations_data : (Array.isArray(product.variations) && typeof product.variations[0] === 'object' ? product.variations : []); const zero = parseFloat(product.price || 0) === 0; const stock = product.stock_quantity; return <div key={product.id} onClick={() => handleProductClick(product)} className="bg-gray-50 border border-gray-200 rounded-lg p-2 flex flex-col justify-between cursor-pointer hover:border-black transition shadow-sm hover:shadow relative z-0"><div><div className="w-full aspect-square bg-gray-200 rounded mb-2 overflow-hidden flex items-center justify-center relative">{imageUrl ? <img src={imageUrl} alt={product.name} className="w-full h-full object-cover" /> : <span className="text-gray-400 text-xs font-bold">GEEN FOTO</span>}{vars.length > 0 && <span className="absolute top-2 right-2 bg-black text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase z-1 shadow">Variaties</span>}{stock !== null && <span key={`${product.id}-${stock}`} className={`absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded font-bold ${stock <= 0 ? 'bg-red-600 text-white' : 'bg-black text-white'} animate-[pulse_1s_ease-in-out_3] motion-reduce:animate-none`}>{stock}</span>}</div><h3 className="font-semibold text-xs line-clamp-2">{product.name}</h3></div><div className="mt-2 flex justify-between items-center"><span className="text-[10px] text-gray-500 font-bold uppercase truncate max-w-[70px]">{getProductCategory(product)}</span><span className="font-bold text-xs sm:text-sm text-red-600">{zero ? 'Open' : `€${parseFloat(product.price || 0).toFixed(2)}`}</span></div></div>; })}</div></div><div className="w-full lg:w-2/5 flex flex-col bg-white rounded-lg shadow p-3 sm:p-4 justify-between"><div><h2 className="text-base sm:text-lg font-bold mb-3 border-b pb-2">Huidige Bestelling</h2><div className="mb-3 bg-gray-50 p-2 rounded border"><label className="text-xs font-bold text-gray-600 block mb-1">Gekoppelde Klant:</label>{selectedCustomer ? <div className="flex justify-between items-center text-sm"><div><span className="font-semibold text-black block">{selectedCustomer.first_name} {selectedCustomer.last_name || ''}</span><span className="text-[11px] text-gray-500 block">{selectedCustomer.email}</span></div><button onClick={() => { setSelectedCustomer(null); setPointsToRedeem(0); setRedeemedDiscount(0); }} className="text-red-500 text-xs underline">Ontkoppel</button></div> : <div><input type="text" placeholder="Zoek klant of medewerker..." value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} className="w-full p-1.5 text-xs border rounded mb-1" />{customerSearch && <div className="max-h-28 overflow-y-auto bg-white border rounded">{filteredCustomers.slice(0, 6).map(customer => <div key={customer.id} onClick={() => { setSelectedCustomer(customer); setCustomerSearch(''); }} className="p-1.5 text-xs hover:bg-gray-100 cursor-pointer border-b last:border-b-0"><div className="font-bold">{customer.first_name} {customer.last_name || ''}</div><div className="text-[10px] text-gray-500">{customer.email}{(customer.username || customer.user_login) && ` · @${customer.username || customer.user_login}`}</div></div>)}</div>}</div>}</div><div className="overflow-y-auto max-h-36 sm:max-h-44 mb-3 divide-y">{!cart.length ? <p className="text-gray-400 text-sm text-center py-4">Geen artikelen in winkelmand</p> : cart.map(item => <div key={item.id} className="py-2 flex justify-between items-center text-xs sm:text-sm"><div className="pr-2"><div className="font-medium">{item.name}</div><div className="text-[11px] text-gray-500">€{parseFloat(item.price).toFixed(2)} x {item.quantity}</div></div><div className="flex items-center space-x-1.5 shrink-0"><button onClick={() => updateQuantity(item.id, -1)} className="w-6 h-6 bg-gray-200 rounded font-bold flex items-center justify-center">-</button><span className="w-5 text-center">{item.quantity}</span><button onClick={() => updateQuantity(item.id, 1)} className="w-6 h-6 bg-gray-200 rounded font-bold flex items-center justify-center">+</button></div></div>)}</div><div className="border-t pt-2 space-y-2 text-xs"><div className="flex justify-between items-center"><span className="font-semibold">Korting / Voucher:</span><select value={discountType} onChange={e => setDiscountType(e.target.value)} className="border p-1 rounded text-xs"><option value="none">Geen</option><option value="percentage">Percentage (%)</option><option value="fixed">Vast Bedrag (€)</option></select></div>{discountType !== 'none' && <input type="number" placeholder={discountType === 'percentage' ? 'Voer % in' : 'Voer bedrag in'} value={discountValue} onChange={e => setDiscountValue(e.target.value)} className="w-full p-1.5 border rounded text-xs" />}<div className="bg-gray-50 p-2 rounded border"><span className="font-semibold block mb-1">Punten Inwisselen (100 pnt = €5):</span><div className="flex space-x-2"><input type="number" min="0" placeholder="Punten" value={pointsToRedeem} onChange={e => setPointsToRedeem(e.target.value)} className="flex-1 p-1.5 border rounded text-xs" /><button onClick={handleRedeemPoints} className="bg-black text-white px-3 py-1.5 rounded text-xs font-semibold">Wissel</button></div></div></div></div><div className="border-t pt-3 mt-2"><div className="flex justify-between text-xs sm:text-sm mb-1"><span>Subtotaal:</span><span>€{subtotal.toFixed(2)}</span></div>{totalDiscount > 0 && <div className="flex justify-between text-xs sm:text-sm text-red-600 mb-1"><span>Korting:</span><span>-€{totalDiscount.toFixed(2)}</span></div>}<div className="flex justify-between text-base sm:text-lg font-bold mb-3"><span>Totaal:</span><span>€{finalTotal.toFixed(2)}</span></div>{selectedCustomer && <div className="text-[11px] text-green-600 mb-2 font-medium">✨ Deze bestelling levert {(Math.floor(finalTotal) + (Math.round((finalTotal - Math.floor(finalTotal)) * 100) >= 51 ? 1 : 0))} punten op voor {selectedCustomer.first_name || selectedCustomer.username}.</div>}{checkoutStatus && <div className={`p-2 rounded text-xs mb-2 ${checkoutStatus.success ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{checkoutStatus.message}</div>}<button onClick={handleOpenPaymentModal} disabled={loading || !cart.length} className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-bold py-3 rounded transition text-xs sm:text-sm uppercase tracking-wider">{loading ? '⏳ Bezig met afrekenen...' : `Afrekenen (€${finalTotal.toFixed(2)})`}</button></div></div></div>)}
  {openAmountProduct && <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6"><h3 className="text-base sm:text-lg font-bold mb-2">Invoeren Open Bedrag</h3><p className="text-xs text-gray-600 mb-4">{openAmountProduct.name}</p><label className="text-xs font-bold text-gray-600 block mb-1">Prijs (€):</label><input type="number" step="0.01" placeholder="0.00" value={customPriceInput} onChange={e => setCustomPriceInput(e.target.value)} className="w-full p-3 border-2 border-black rounded text-xl font-bold mb-4" autoFocus /><div className="flex space-x-2"><button onClick={() => setOpenAmountProduct(null)} className="w-1/2 bg-gray-200 text-black font-bold py-2.5 rounded text-xs">Annuleren</button><button onClick={handleConfirmOpenAmount} className="w-1/2 bg-red-600 text-white font-bold py-2.5 rounded text-xs">Toevoegen</button></div></div></div>}
  {showCustomModal && <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6"><h3 className="text-base sm:text-lg font-bold mb-4">Custom Artikel Toevoegen</h3><div className="space-y-3 mb-4"><input type="text" placeholder="Artikelnaam" value={customItem.name} onChange={e => setCustomItem({ ...customItem, name: e.target.value })} className="w-full p-2.5 border rounded text-sm" autoFocus /><input type="number" step="0.01" placeholder="Bedrag (€)" value={customItem.price} onChange={e => setCustomItem({ ...customItem, price: e.target.value })} className="w-full p-2.5 border rounded text-sm" /></div><div className="flex space-x-2"><button onClick={() => setShowCustomModal(false)} className="w-1/2 bg-gray-200 py-2.5 rounded text-xs font-bold">Annuleren</button><button onClick={handleAddCustomItem} className="w-1/2 bg-red-600 text-white py-2.5 rounded text-xs font-bold">Toevoegen</button></div></div></div>}
  {selectedProductForVariations && <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"><h3 className="text-base sm:text-lg font-bold mb-1">Kies Variatie</h3><p className="text-xs text-gray-600 mb-4">{selectedProductForVariations.name}</p><div className="space-y-2 max-h-60 overflow-y-auto mb-4">{(selectedProductForVariations.variations_data || []).map(variation => { const attr = formatAttributes(variation.attributes) || `Variatie #${variation.id}`; return <button key={variation.id} onClick={() => handleSelectVariation(variation)} className="w-full text-left p-3 border rounded hover:border-black flex justify-between items-center bg-gray-50 font-semibold text-xs"><div><div>{attr}</div><div className="text-[10px] text-gray-500">Voorraad: {variation.stock_quantity ?? 'N.v.t.'}</div></div><span className="text-red-600 font-bold">€{parseFloat(variation.price || selectedProductForVariations.price || 0).toFixed(2)}</span></button>; })}</div><button onClick={() => setSelectedProductForVariations(null)} className="w-full bg-gray-200 text-black font-bold py-2.5 rounded text-xs">Sluiten</button></div></div>}
  {stockWarningModal.show && <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-[60]"><div className="bg-white rounded-lg shadow-2xl max-w-sm w-full p-6 space-y-4 text-center"><div className="text-red-600 text-4xl">⚠️</div><h3 className="text-base sm:text-lg font-bold">Voorraad Waarschuwing</h3><p className="text-xs text-gray-600 font-semibold">Weet je zeker dat je dit product wilt toevoegen?</p><div className="flex space-x-2 pt-2"><button onClick={() => setStockWarningModal({ show: false, product: null, variation: null, price: 0, cartItemId: null, quantityDelta: 1 })} className="w-1/2 bg-gray-200 text-black font-bold py-2.5 rounded text-xs">Nee</button><button onClick={handleConfirmStockWarning} className="w-1/2 bg-red-600 text-white font-bold py-2.5 rounded text-xs">Ja, Toevoegen</button></div></div></div>}
  {showStoreModal && <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-lg p-6 max-w-md w-full space-y-4 shadow-2xl"><h3 className="text-base sm:text-lg font-bold">📍 Koppel Kassasysteem aan Filiaal</h3><div className="space-y-2 max-h-60 overflow-y-auto">{allStores.map(store => <button key={store.id || store.store_id} onClick={() => handleSelectStore(store)} className="w-full p-3 border rounded text-left hover:bg-gray-100 transition flex justify-between items-center"><div><div className="font-bold text-sm">{store.store_name || store.name}</div></div></button>)}</div></div></div>}
  {showPaymentModal && <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"><h3 className="text-base sm:text-lg font-bold mb-4 border-b pb-2">Kies Betaalmethode</h3><div className="grid grid-cols-3 gap-2 mb-4">{paymentMethods.sumup !== false && <button onClick={() => selectPaymentMethod('sumup')} className={`p-3 text-xs font-bold border rounded ${selectedPaymentMethod === 'sumup' ? 'bg-black text-white' : 'bg-gray-100'}`}>💳 SumUp</button>}{paymentMethods.manual_pin !== false && <button onClick={() => selectPaymentMethod('manual_pin')} className={`p-3 text-xs font-bold border rounded ${selectedPaymentMethod === 'manual_pin' ? 'bg-black text-white' : 'bg-gray-100'}`}>📌 Pin</button>}{paymentMethods.cash !== false && <button onClick={() => selectPaymentMethod('cash')} className={`p-3 text-xs font-bold border rounded ${selectedPaymentMethod === 'cash' ? 'bg-black text-white' : 'bg-gray-100'}`}>💵 Contant</button>}</div>{selectedPaymentMethod === 'sumup' && finalTotal < 1 && <div className="bg-red-100 text-red-700 p-3 rounded text-xs font-bold mb-4">SumUp betalingen moeten minimaal €1,00 zijn.</div>}{selectedPaymentMethod === 'cash' && <div className="bg-gray-50 p-4 rounded border mb-4 space-y-3"><input type="number" step="0.01" value={cashGiven} onChange={e => setCashGiven(e.target.value)} className="w-full p-2.5 border rounded font-bold text-lg" placeholder="Ontvangen bedrag"/><div className="bg-black text-white p-2.5 rounded flex justify-between"><span>Wisselgeld:</span><span className="text-green-400 font-bold">€{changeDue.toFixed(2)}</span></div></div>}<div className="flex space-x-2"><button onClick={() => setShowPaymentModal(false)} className="w-1/3 bg-gray-200 py-3 rounded text-xs font-bold">Annuleren</button><button onClick={handleInitiatePayment} className="w-2/3 bg-red-600 text-white py-3 rounded text-xs font-bold">Bevestigen (€{finalTotal.toFixed(2)})</button></div></div></div>}
  {completedOrderForReceipt && (completedOrderForReceipt.paymentDetails?.method === 'cash' || completedOrderForReceipt.paymentDetails?.method === 'sumup') && <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[80]"><div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 text-center"><div className="text-4xl mb-3">🧾</div><h3 className="text-lg font-bold mb-2">Bon afdrukken?</h3><p className="text-sm text-gray-600 mb-5">Wil je een bon afdrukken voor deze bestelling?</p><div className="flex space-x-2"><button onClick={() => handleReceiptChoice(false)} className="w-1/2 bg-gray-200 py-3 rounded text-sm font-bold">Geen bon</button><button onClick={() => handleReceiptChoice(true)} className="w-1/2 bg-black text-white py-3 rounded text-sm font-bold">🖨️ Bon printen</button></div></div></div>}
  {pickupCheckout && <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[80]"><div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 text-center"><h3 className="text-lg font-bold mb-2">Afhaalbestelling #{pickupCheckout.id} afrekenen</h3><p className="text-3xl font-black mb-4">€{parseFloat(pickupCheckout.total || 0).toFixed(2)}</p><div className="flex space-x-2"><button onClick={() => handleMarkAsPickedUp(pickupCheckout.id, 'cash')} className="w-1/2 bg-green-600 text-white font-bold py-3 rounded text-xs">Contant</button><button onClick={() => handleMarkAsPickedUp(pickupCheckout.id, 'manual_pin')} className="w-1/2 bg-black text-white font-bold py-3 rounded text-xs">Pin</button></div><button onClick={() => setPickupCheckout(null)} className="mt-3 w-full bg-gray-200 py-2 rounded text-xs font-bold">Annuleren</button></div></div>}
  {showManualPinConfirm && <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[70]"><div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 text-center"><div className="text-4xl mb-3">📌</div><h3 className="text-lg font-bold mb-2">Handmatige PIN-betaling</h3><div className="bg-gray-100 border-2 border-black rounded-xl p-4 mb-4 shadow-sm"><div className="text-xs font-extrabold uppercase tracking-widest text-gray-500 mb-1">TE BETALEN</div><div className="text-5xl font-black tracking-tight text-black leading-none">€{finalTotal.toFixed(2)}</div></div><p className="text-xs text-gray-600 mb-5">Bevestig dat dit bedrag op de PIN-terminal succesvol is betaald.</p><div className="flex space-x-2"><button onClick={() => setShowManualPinConfirm(false)} className="w-1/2 bg-gray-200 py-3 rounded text-xs font-bold">Annuleren</button><button onClick={executeCheckout} className="w-1/2 bg-green-600 text-white font-bold py-3 rounded text-xs">✓ Betaald</button></div></div></div>}
    </div>);
}
