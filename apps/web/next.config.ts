import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  transpilePackages: ['@bjj/core'],
  serverExternalPackages: ['pg'],
  turbopack: { root: path.join(__dirname, '../..') },
  images: { unoptimized: true },
};

export default nextConfig;
