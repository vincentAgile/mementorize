import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Docker image (phase 7): `next build` also produces .next/standalone, a
  // minimal server.js with only the node_modules files it actually uses.
  output: 'standalone',
  // Monorepo: dependencies are traced from the repository root (pnpm keeps
  // them in the root node_modules), so the standalone folder mirrors the
  // repo layout and the server ends up in .next/standalone/apps/web/.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  experimental: {
    serverActions: {
      // A CSV file to import (MEM-53) goes through a Server Action: up to
      // 1 Mo, plus the overhead of multipart/form-data. 1 MB by default.
      bodySizeLimit: '2mb',
    },
  },
  // MEM-2: Settings moved to /reglages. Reminder e-mails already sent still
  // link to /settings.
  async redirects() {
    return [{ source: '/settings', destination: '/reglages', permanent: true }];
  },
};

export default nextConfig;
