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

async function getAdminStores() {
  try {
    const response = await fetch('/api/admin/store', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) return [];
    return Array.isArray(data.stores) ? data.stores : (data.store ? [data.store] : []);
  } catch {
    return [];
  }
}

function installSumUpStoreSelector() {
  if (typeof window === 'undefined' || window.__bendemenSumUpStoreSelectorInstalled) return;
  window.__bendemenSumUpStoreSelectorInstalled = true;

  const enhance = async () => {
    if (!window.location.pathname.startsWith('/admin')) return;

    const heading = Array.from(document.querySelectorAll('h3, h4')).find((el) =>
      el.textContent?.includes('SumUp Apparaat & Koppeling Beheer')
    );
    if (!heading) return;

    // Find the actual SumUp card/form instead of relying on a fixed DOM depth.
    let card = heading.parentElement;
    let form = null;
    while (card && card !== document.body) {
      form = card.querySelector('form');
      if (form) break;
      card = card.parentElement;
    }
    if (!form) return;

    // If readers exist, admin.js already renders its per-reader selector.
    // Only add the global selector when there are no reader selectors yet.
    if (card.querySelector('select')) return;
    if (form.querySelector('[data-bendemen-sumup-store]')) return;

    const stores = await getAdminStores();
    if (!stores.length) return;

    const wrapper = document.createElement('div');
    wrapper.dataset.bendemenSumupStore = 'true';
    wrapper.className = 'bg-white border border-gray-200 rounded p-3 space-y-1';

    const label = document.createElement('label');
    label.className = 'block text-xs font-bold uppercase tracking-wider text-gray-700';
    label.textContent = 'Filiaal voor deze SumUp Solo';

    const select = document.createElement('select');
    select.id = 'bendemen-sumup-store-select';
    select.className = 'w-full p-2 border rounded text-xs';
    select.innerHTML = '<option value="">-- Selecteer Filiaal --</option>';
    stores.forEach((store) => {
      const option = document.createElement('option');
      option.value = String(store.id || store.store_id || '');
      option.textContent = store.store_name || store.name || option.value;
      if (store.terminal_id) option.textContent += ` — gekoppeld: ${store.terminal_id}`;
      select.appendChild(option);
    });

    const help = document.createElement('div');
    help.className = 'text-[11px] text-gray-500';
    help.textContent = 'Kies eerst het filiaal. Na het koppelen wordt de nieuwe Solo automatisch aan dit filiaal toegewezen.';

    wrapper.appendChild(label);
    wrapper.appendChild(select);
    wrapper.appendChild(help);
    form.insertBefore(wrapper, form.firstChild);

    form.addEventListener('submit', async () => {
      const storeId = select.value;
      if (!storeId) {
        setTimeout(() => alert('Selecteer eerst een filiaal voor deze SumUp Solo.'), 0);
        return;
      }

      const before = new Set();
      try {
        const current = await fetch('/api/sumup/proxy?action=readers', { cache: 'no-store' });
        const data = await current.json().catch(() => ({}));
        (data.readers || []).forEach((reader) => before.add(String(reader.id)));
      } catch {}

      const started = Date.now();
      const findAndAssign = async () => {
        if (Date.now() - started > 30000) return;
        try {
          const response = await fetch('/api/sumup/proxy?action=readers', { cache: 'no-store' });
          const data = await response.json().catch(() => ({}));
          const readers = Array.isArray(data.readers) ? data.readers : [];
          const newest = readers.find((reader) => !before.has(String(reader.id)));
          if (newest?.id) {
            const assign = await fetch('/api/sumup/proxy?action=assign-store', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ storeId, readerId: newest.id }),
            });
            const result = await assign.json().catch(() => ({}));
            if (result.success) setTimeout(() => window.location.reload(), 500);
            return;
          }
        } catch {}
        setTimeout(findAndAssign, 1500);
      };
      setTimeout(findAndAssign, 2500);
    }, true);
  };

  const observer = new MutationObserver(() => enhance());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  enhance();
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
    installSumUpStoreSelector();
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
