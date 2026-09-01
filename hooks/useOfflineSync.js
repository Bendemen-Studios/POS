// hooks/useOfflineSync.js
import { useCallback, useEffect, useRef, useState } from 'react';

const OFFLINE_QUEUE_KEY = 'pos_offline_orders';

function readQueue() {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  if (typeof window !== 'undefined') {
    if (queue.length) localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    else localStorage.removeItem(OFFLINE_QUEUE_KEY);
    window.dispatchEvent(new CustomEvent('pos:offline-queue-updated', { detail: { count: queue.length } }));
    window.dispatchEvent(new CustomEvent('pos:ajax-refresh'));
  }
}

function getIdempotencyKey(order) {
  return String(order?.clientOrderId || order?.created_at || `${order?.storeId || 1}-${order?.cashierId || 1}-${JSON.stringify(order)}`).slice(0, 128);
}

async function sendOfflineOrder(order) {
  const headers = {
    'Content-Type': 'application/json',
    'Idempotency-Key': getIdempotencyKey(order),
  };
  const body = JSON.stringify(order);

  let response = await fetch('/api/woocommerce/checkout', { method: 'POST', headers, body, cache: 'no-store' });

  // Checkout and offline-order share the same idempotency store. If checkout
  // is unavailable/fails, let the dedicated offline endpoint take over.
  if (response.status === 404 || response.status === 409 || response.status >= 500) {
    response = await fetch('/api/woocommerce/offline-order', { method: 'POST', headers, body, cache: 'no-store' });
  }

  let data = null;
  try { data = await response.json(); } catch { data = null; }
  return { response, data };
}

export function useOfflineSync() {
  const [isSyncingOrders, setIsSyncingOrders] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const syncingRef = useRef(false);

  const checkUnsyncedOrders = useCallback(() => {
    setUnsyncedCount(readQueue().length);
  }, []);

  const syncOfflineOrders = useCallback(async () => {
    if (syncingRef.current || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;

    const pendingOrders = readQueue();
    if (pendingOrders.length === 0) {
      setUnsyncedCount(0);
      return;
    }

    syncingRef.current = true;
    setIsSyncingOrders(true);
    const remaining = [];
    let syncedCount = 0;

    try {
      for (const order of pendingOrders) {
        try {
          const { response, data } = await sendOfflineOrder(order);
          if (response.ok && data?.success) syncedCount += 1;
          else remaining.push(order);
        } catch (error) {
          console.warn(`Offline order ${order.clientOrderId || 'unknown'} blijft in de wachtrij:`, error);
          remaining.push(order);
        }
      }

      writeQueue(remaining);
      setUnsyncedCount(remaining.length);
      if (syncedCount > 0) {
        window.dispatchEvent(new CustomEvent('pos:ajax-refresh', { detail: { offlineOrdersSynced: syncedCount } }));
      }
    } finally {
      syncingRef.current = false;
      setIsSyncingOrders(false);
    }
  }, []);

  useEffect(() => {
    checkUnsyncedOrders();
    syncOfflineOrders();

    const handleOnline = () => syncOfflineOrders();
    window.addEventListener('online', handleOnline);

    // Check every 5 seconds so recovery does not depend on the browser firing
    // an online event or on a manual refresh.
    const interval = window.setInterval(() => {
      if (navigator.onLine) syncOfflineOrders();
      else checkUnsyncedOrders();
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.clearInterval(interval);
    };
  }, [checkUnsyncedOrders, syncOfflineOrders]);

  return {
    isSyncingOrders,
    unsyncedCount,
    syncOfflineOrders,
    checkUnsyncedOrders,
  };
}