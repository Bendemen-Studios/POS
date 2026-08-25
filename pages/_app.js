import Head from 'next/head';
import { useEffect } from 'react';
import '../styles/globals.css';

const SUMUP_GATEWAY = 'https://pos-sumup.vercel.app';

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
