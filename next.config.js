const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep Next.js tracing scoped to this application when /var/www also
  // contains a parent-level package-lock.json used by another project.
  outputFileTracingRoot: path.join(__dirname),
};

// The installed next-pwa release is incompatible with the current Next.js
// webpack configuration and crashes during `next build`. The POS already has
// its own offline queue/local-storage logic, so disable next-pwa entirely for
// now rather than shipping a build that cannot start.
module.exports = nextConfig;
