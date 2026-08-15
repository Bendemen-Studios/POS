import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="nl">
      <Head>
        {/* Directe Tailwind Play CDN laden via server-side HTML Head */}
        <script src="https://cdn.tailwindcss.com"></script>
      </Head>
      <body className="bg-white text-black antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}