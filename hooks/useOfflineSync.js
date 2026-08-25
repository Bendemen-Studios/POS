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
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  }
}

export function useOfflineSync() {
  const [isSyncingOrders, setIsSyncingOrders] = useState(false);
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const syncingRef = useRef(false);

  const checkUnsyncedOrders = useCallback(() => {
    setUnsyncedCount(readQueue().length);
  }, []);

  const syncOfflineOrders = useCallback(async () => {
    if (syncingRef.current) return;

    const pendingOrders = readQueue();
    if (pendingOrders.length === 0) {
      setUnsyncedCount(0);
      return;
    }

    syncingRef.current = true;
    setIsSyncingOrders(true);

    const remaining = [];

    try {
      for (const order of pendingOrders) {
        try {
          let response = await fetch('/api/woocommerce/checkout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(order.clientOrderId
                ? { 'Idempotency-Key': String(order.clientOrderId) }
                : {}),
            },
            body: JSON.stringify(order),
          });

          if (response.status === 404) {
            response = await fetch('/api/woocommerce/offline-order', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(order.clientOrderId
                  ? { 'Idempotency-Key': String(order.clientOrderId) }
                  : {}),
              },
              body: JSON.stringify(order),
            });
          }

          let data = null;
          try {
            data = await response.json();
          } catch {
            data = null;
          }

          if (!response.ok || !data?.success) {
            remaining.push(order);
          }
        } catch (error) {
          console.warn(`Offline order ${order.clientOrderId || 'unknown'} blijft in de wachtrij:`, error);
          remaining.push(order);
        }
      }

      writeQueue(remaining);
      setUnsyncedCount(remaining.length);
    } finally {
      syncingRef.current = false;
      setIsSyncingOrders(false);
    }
  }, []);

  useEffect(() => {
    checkUnsyncedOrders();

    // Probeer bij iedere app-start direct te synchroniseren wanneer er verbinding is.
    if (navigator.onLine) {
      syncOfflineOrders();
    }

    const handleOnline = () => syncOfflineOrders();
    window.addEventListener('online', handleOnline);

    // Herstel ook verbindingen waarbij de browser geen 'online' event afvuurt.
    const interval = window.setInterval(() => {
      if (navigator.onLine) syncOfflineOrders();
      else checkUnsyncedOrders();
    }, 30000);

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