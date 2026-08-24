const withPWA = require('next-pwa')({
  dest: 'public',
  disable: false,
  register: true,
  skipWaiting: true,
  fallbacks: {
    document: '/login',
  },
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
        ],
      },
    ];
  },
};

module.exports = withPWA(nextConfig);