const withPWA = require('next-pwa')({
  dest: 'public',
  disable: false,
  register: true,
  skipWaiting: true,
  fallbacks: {
    // Voorkom dat hij vastloopt als er geen netwerk is bij een route-navigatie
    document: '/login',
  }
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = withPWA(nextConfig);