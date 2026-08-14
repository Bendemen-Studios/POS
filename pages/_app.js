import Head from 'next/head';

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>BENDEMEN POS</title>
        <meta 
          name="viewport" 
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" 
        />
        
        {/* Tailwind CSS Direct Inladen (100% werkend) */}
        <script src="https://cdn.tailwindcss.com"></script>

        {/* Favicon & PWA Settings */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
      </Head>

      <style jsx global>{`
        html, body {
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