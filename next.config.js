/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

// The installed next-pwa release is incompatible with the current Next.js
// webpack configuration and crashes during `next build`. The POS already has
// its own offline queue/local-storage logic, so disable next-pwa entirely for
// now rather than shipping a build that cannot start.
module.exports = nextConfig;
