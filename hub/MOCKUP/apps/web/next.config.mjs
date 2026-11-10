/** @type {import('next').NextConfig} */
const apiInternalOrigin =
  process.env.PORTAL_API_INTERNAL_URL ||
  process.env.API_INTERNAL_URL ||
  'http://127.0.0.1:4000';

const nextConfig = {
  basePath: '/hub',
  reactStrictMode: true,
  transpilePackages: ['@mockup/canvas-engine', '@mockup/types', '@mockup/validation'],
  experimental: {
    serverComponentsExternalPackages: ['potrace'],
  },
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiInternalOrigin}/api/v1/:path*`,
        basePath: false,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
