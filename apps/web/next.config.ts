import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@brunchsters/shared', '@brunchsters/core'],
  // pnpm lint is the authoritative ESLint check; don't re-lint during next build
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
