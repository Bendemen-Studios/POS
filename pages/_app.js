import Head from 'next/head';
import { useEffect } from 'react';
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
      // A temporary network error must not turn a possibly successful payment
      // into a second checkout. Continue polling until the safe timeout.
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

      try {
        const rawStore = localStorage.getItem('selectedStore') || localStorage.getItem('pos_selected_store');
        const store = rawStore ? JSON.parse(rawStore) : null;
        if (!body.readerId && store?.terminal_id) body.readerId = store.terminal_id;
      } catch {}

      nextInit.body = JSON.stringify(body);
      headers.set('Content-Type', 'application/json');

      // Starting a Solo checkout is asynchronous. The gateway returns immediately;
      // poll the authoritative Transactions API here and only report success to the
      // existing POS payment flow after SumUp reports SUCCESSFUL.
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

export default function App({ Component, pageProps }) {
  useEffect(() => {
    installSumUpGatewayFetch();
    registerNativePWA();
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
      <Component {...pageProps} />
    </>
  );
}
