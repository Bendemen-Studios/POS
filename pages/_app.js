import Head from 'next/head';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        {/* Paginatitel */}
        <title>BENDEMEN POS</title>

        {/* Viewport & Mobiele Schaalinstellingen */}
        <meta 
          name="viewport" 
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" 
        />

        {/* Favicon Koppelingen */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icon-192x192.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192x192.png" />

        {/* Apple iOS Web App Instellingen */}
        <link rel="apple-touch-icon" href="/icon-192x192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="BDM POS" />

        {/* PWA Manifest & Thema */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <meta name="description" content="BENDEMEN Point of Sale Kassasysteem" />
      </Head>

      {/* Globale Reset & Tailwind CSS Directives */}
      <style jsx global>{`
        @tailwind base;
        @tailwind components;
        @tailwind utilities;

        html,
        body {
          padding: 0;
          margin: 0;
          background-color: #ffffff;
          color: #111111;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
        }

        *, *::before, *::after {
          box-sizing: border-box;
        }

        input, select, button {
          font-family: inherit;
        }
      `}</style>

      <Component {...pageProps} />
    </>
  );
}