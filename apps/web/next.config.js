const { randomBytes } = require('crypto');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  transpilePackages: ['@socialboost/shared'],
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  generateBuildId: async () => {
    // Use crypto to generate a build ID instead of uuid
    return randomBytes(16).toString('hex');
  },
};

module.exports = nextConfig;
