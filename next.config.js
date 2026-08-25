const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV !== 'production',
  register: true,
  skipWaiting: true,
  reloadOnOnline: false,
  cacheStartUrl: true,
  dynamicStartUrl: false,
  cacheOnFrontEndNav: true,
  fallbacks: {
    document: '/login',
  },
  // Keep the PWA build compatible with the installed next-pwa version.
  // Runtime API/document caching is handled by the app's own offline queue
  // and local storage, so do not pass runtimeCaching entries through the
  // next-pwa webpack integration here.
  additionalManifestEntries: ['/login', '/select-store', '/'],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Content-Type',
            value: 'application/javascript; charset=utf-8',
          },
        ],
      },
    ];
  },
};

module.exports = withPWA(nextConfig);