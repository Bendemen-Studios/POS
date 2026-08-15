import Head from 'next/head';
import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>BENDEMEN POS</title>
        <meta 
          name="viewport" 
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" 
        />
        
        {/* Favicon & PWA Settings */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </Head>

      <style jsx global>{`
        html, body {
          padding: 0;
          margin: 0;
          height: 100%;
          height: 100dvh;
          background-color: #ffffff;
          color: #111111;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          -webkit-tap-highlight-color: transparent;
          -webkit-touch-callout: none;
          user-select: none;
          overscroll-behavior-y: none;
          overflow-x: hidden;
        }

        *, *::before, *::after {
          box-sizing: border-box;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
        }

        input, select, textarea, button {
          font-family: inherit;
          -webkit-user-select: auto !important;
          user-select: auto !important;
        }
      `}</style>

      <Component {...pageProps} />
    </>
  );
}