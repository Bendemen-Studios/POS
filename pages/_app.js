import Head from 'next/head';
import { useEffect, useState } from 'react';
import '../styles/globals.css';

const SUMUP_GATEWAY = 'https://pos-sumup.vercel.app';
const SUMUP_FINAL_STATUSES = new Set(['SUCCESSFUL', 'FAILED', 'CANCELLED', 'REFUNDED']);

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function pollSumUpTransaction(clientTransactionId, originalFetch) {
  const started = Date.now();
  const timeout = 110000;
  let lastStatus = 'PENDING';

  while (Date.now() - started < timeout) {
    try {
      const statusUrl = new URL('/api/proxy', SUMUP_GATEWAY);
      statusUrl.searchParams.set('action', 'transaction');
      statusUrl.searchParams.set('clientTransactionId', clientTransactionId);

      const response = await originalFetch(statusUrl.toString(), {
        method: 'GET',
        cache: 'no-store',
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        lastStatus = data?.status || lastStatus;
      } else {
        const transaction = data?.transaction || {};
        const status = String(data?.status || transaction?.status || 'PENDING').toUpperCase();
        lastStatus = status;

        if (SUMUP_FINAL_STATUSES.has(status)) {
          return {
            ...data,
            success: status === 'SUCCESSFUL',
            pending: false,
            clientTransactionId,
          };
        }
      }
    } catch (error) {
      console.warn('[SUMUP] tijdelijke statusfout:', error.message);
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  return {
    success: false,
    pending: true,
    clientTransactionId,
    status: lastStatus,
    error: 'De SumUp-betaling is nog niet definitief bevestigd. Probeer niet opnieuw te betalen; controleer eerst de Solo en de transactiegeschiedenis.',
  };
}

function installSumUpGatewayFetch() {
  if (typeof window === 'undefined' || window.__bendemenSumUpFetchInstalled) return;
  window.__bendemenSumUpFetchInstalled = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : input?.url;
    if (!rawUrl) return originalFetch(input, init);

    let url;
    try { url = new URL(rawUrl, window.location.origin); } catch { return originalFetch(input, init); }
    if (url.pathname !== '/api/sumup/proxy') return originalFetch(input, init);
    if (url.searchParams.get('action') === 'assign-store') return originalFetch(input, init);

    const gatewayUrl = new URL('/api/proxy', SUMUP_GATEWAY);
    url.searchParams.forEach((value, key) => gatewayUrl.searchParams.set(key, value));

    const nextInit = { ...init };
    const headers = new Headers(init?.headers || (typeof input !== 'string' ? input.headers : undefined));
    nextInit.headers = headers;

    if (url.searchParams.get('action') === 'pay' && (init?.method || 'GET').toUpperCase() === 'POST') {
      let body = {};
      try { body = typeof init.body === 'string' ? JSON.parse(init.body) : {}; } catch {}

      // SumUp accepteert geen betalingen onder €1,00.
      const totalAmount = Number(body.totalAmount ?? body.amount ?? body.total ?? 0);
      if (Number.isFinite(totalAmount) && totalAmount < 1) {
        window.alert('SumUp-betalingen moeten minimaal €1,00 zijn.');
        return jsonResponse({
          success: false,
          pending: false,
          status: 'FAILED',
          error: 'Het minimale bedrag voor een SumUp-betaling is €1,00.',
        }, 400);
      }

      try {
        const rawStore = localStorage.getItem('selectedStore') || localStorage.getItem('pos_selected_store');
        const store = rawStore ? JSON.parse(rawStore) : null;
        if (!body.readerId && store?.terminal_id) body.readerId = store.terminal_id;
      } catch {}

      nextInit.body = JSON.stringify(body);
      headers.set('Content-Type', 'application/json');

      const startResponse = await originalFetch(gatewayUrl.toString(), nextInit);
      const startData = await startResponse.json().catch(() => ({}));
      if (!startResponse.ok || !startData?.success) {
        return jsonResponse(startData, startResponse.status);
      }

      if (!startData.clientTransactionId) {
        return jsonResponse({
          success: false,
          error: 'SumUp gaf geen client_transaction_id terug. Controleer de Solo voordat je opnieuw probeert te betalen.',
        }, 502);
      }

      const result = await pollSumUpTransaction(startData.clientTransactionId, originalFetch);
      return jsonResponse(result, result.success ? 200 : 409);
    }

    return originalFetch(gatewayUrl.toString(), nextInit);
  };
}

function registerNativePWA() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.error('[PWA] Service worker registration failed:', error);
    });
  }, { once: true });
}

function getOfflineQueueCount(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function installOfflineAjaxBridge(notify) {
  if (typeof window === 'undefined' || window.__bendemenOfflineAjaxInstalled) return () => {};
  window.__bendemenOfflineAjaxInstalled = true;

  // Alleen de offline-order queue triggert een melding. De POS-component
  // wordt NIET meer geremount: dat kan een lopende checkout/sync onderbreken.
  const notifyKeys = new Set(['pos_offline_orders']);
  const originalSetItem = Storage.prototype.setItem;
  const originalGetItem = Storage.prototype.getItem;
  const originalRemoveItem = Storage.prototype.removeItem;
  let refreshTimer = null;

  const scheduleRefresh = (key, message = null) => {
    if (!notifyKeys.has(key)) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      window.dispatchEvent(new Event('pos:ajax-refresh'));
      notify(message);
    }, 0);
  };

  Storage.prototype.setItem = function(key, value) {
    if (notifyKeys.has(key)) {
      const oldCount = getOfflineQueueCount(originalGetItem.call(this, key));
      const newCount = getOfflineQueueCount(value);
      const message = newCount < oldCount
        ? `✅ ${oldCount - newCount} offline bestelling(en) succesvol geüpload!`
        : null;
      originalSetItem.call(this, key, value);
      scheduleRefresh(key, message);
      return;
    }
    originalSetItem.call(this, key, value);
  };

  Storage.prototype.removeItem = function(key) {
    const oldCount = notifyKeys.has(key) ? getOfflineQueueCount(originalGetItem.call(this, key)) : 0;
    originalRemoveItem.call(this, key);
    if (notifyKeys.has(key) && oldCount > 0) {
      scheduleRefresh(key, `🗑️ ${oldCount} offline bestelling(en) uit de wachtrij verwijderd.`);
    }
  };

  const handleStorage = (event) => {
    if (!event.key || !notifyKeys.has(event.key)) return;
    const oldCount = getOfflineQueueCount(event.oldValue);
    const newCount = getOfflineQueueCount(event.newValue);
    const message = newCount < oldCount
      ? `✅ ${oldCount - newCount} offline bestelling(en) succesvol geüpload!`
      : null;
    scheduleRefresh(event.key, message);
  };

  window.addEventListener('storage', handleStorage);

  let channel = null;
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel('bendemen-pos');
    channel.addEventListener('message', () => notify(null));
  }

  return () => {
    clearTimeout(refreshTimer);
    Storage.prototype.setItem = originalSetItem;
    Storage.prototype.removeItem = originalRemoveItem;
    window.removeEventListener('storage', handleStorage);
    if (channel) channel.close();
    window.__bendemenOfflineAjaxInstalled = false;
  };
}

export default function App({ Component, pageProps }) {
  const [offlineSyncMessage, setOfflineSyncMessage] = useState(null);

  useEffect(() => {
    installSumUpGatewayFetch();
    registerNativePWA();
    return installOfflineAjaxBridge((message) => {
      if (message) {
        setOfflineSyncMessage(message);
        window.setTimeout(() => setOfflineSyncMessage(null), 4500);
      }
    });
  }, []);

  return (
    <>
      <Head>
        <title>BENDEMEN POS</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </Head>
      {offlineSyncMessage && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: 18,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99999,
            background: '#111827',
            color: '#fff',
            padding: '12px 18px',
            borderRadius: 10,
            boxShadow: '0 8px 30px rgba(0,0,0,.28)',
            fontSize: 15,
            fontWeight: 600,
            pointerEvents: 'none',
          }}
        >
          {offlineSyncMessage}
        </div>
      )}
      <Component {...pageProps} />
    </>
  );
}
