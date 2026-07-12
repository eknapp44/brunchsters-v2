import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@brunchsters/shared', '@brunchsters/core', '@brunchsters/database'],
  // Keep @prisma/client as a Node.js external (not bundled); requires it to be a direct dep of apps/web
  serverExternalPackages: ['@prisma/client', '.prisma/client'],
  // pnpm lint is the authoritative ESLint check; don't re-lint during next build
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
