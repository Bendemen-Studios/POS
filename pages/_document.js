import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="nl">
      <Head>
        <meta name="mobile-web-app-capable" content="yes" />
      </Head>
      <body className="bg-white text-black antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
