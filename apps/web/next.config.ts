import type { NextConfig } from 'next';

const apiBaseUrl = process.env['AINVR_API_BASE_URL'] || 'http://127.0.0.1:4000';

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ainvr/ui', '@ainvr/contracts'],
  experimental: {
    optimizePackageImports: ['@radix-ui/*'],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl}/api/:path*`,
      },
    ];
  },
};

export default config;
