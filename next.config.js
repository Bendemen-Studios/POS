const withPWA = require('next-pwa')({
  dest: 'public',
  disable: false,
  register: true,
  skipWaiting: true,
  // Zorg dat offline verzoeken netjes worden opgevangen zonder vast te lopen
  fallbacks: {
    document: '/login', // Of je hoofdpagina
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Zorg dat assets correct worden opgeslagen voor offline gebruik
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