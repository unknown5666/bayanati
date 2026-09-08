/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // firebase-admin, googleapis and nodemailer are server-only; keep them external
    // so the App Router bundler does not try to pull them into the client bundle.
    serverComponentsExternalPackages: ['firebase-admin', 'googleapis', 'nodemailer'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  // The HTML documents reference build-hashed JS chunks. If a cache/CDN serves a
  // stale HTML shell after a redeploy, it points browsers at old chunk hashes
  // that were cleaned off disk -> 404 -> ChunkLoadError -> blank page. Marking
  // every page document no-store forbids any shared cache (Hostinger LiteSpeed /
  // CDN included) from pinning an old shell, so each request gets HTML matching
  // the current build. Hashed static assets under /_next/static keep Next's own
  // long-lived immutable caching (this only matches page routes, not assets).
  async headers() {
    const noStore = [
      { key: 'Cache-Control', value: 'no-store, must-revalidate' },
    ];
    return [
      { source: '/', headers: noStore },
      { source: '/auth/login', headers: noStore },
      { source: '/crew/dashboard', headers: noStore },
      { source: '/crew/form', headers: noStore },
    ];
  },
};

module.exports = nextConfig;
