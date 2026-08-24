const withPWA = require('next-pwa')({
  dest: 'public',
  disable: false, // Zet op false zodat PWA en caching ook lokaal/tijdens tests werken[cite: 3]
  register: true,
  skipWaiting: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = withPWA(nextConfig);