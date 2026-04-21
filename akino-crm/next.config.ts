import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Don't leak that this is Next.js
  poweredByHeader: false,
  // Strict mode catches bugs during dev without affecting prod
  reactStrictMode: true,
  // Gzip responses
  compress: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
