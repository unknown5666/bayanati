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
};

module.exports = nextConfig;
