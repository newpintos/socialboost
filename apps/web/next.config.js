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
  webpack: (config) => {
    // Ensure CSS is processed
    config.resolve.extensions.push('.css');
    return config;
  },
};

module.exports = nextConfig;
