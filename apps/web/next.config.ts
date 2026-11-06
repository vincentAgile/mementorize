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
  // MEM-123: the tabs « Listes prédéfinies » and « Import / export » of the
  // Anglais space became the two choices of « Ajouter une liste » (the query,
  // ?niveau=A2, goes along). /anglais/import-export/export still answers:
  // only the page itself moves.
  async redirects() {
    return [
      { source: '/settings', destination: '/reglages', permanent: true },
      { source: '/anglais/listes-predefinies', destination: '/anglais/ajouter-liste/predefinies', permanent: true },
      {
        source: '/anglais/listes-predefinies/:id',
        destination: '/anglais/ajouter-liste/predefinies/:id',
        permanent: true,
      },
      { source: '/anglais/import-export', destination: '/anglais/ajouter-liste/fichier', permanent: true },
      // Settings: the tab Révision joined Général, « Saisie et fichiers » became « Import / export ».
      { source: '/reglages/revision', destination: '/reglages', permanent: true },
      { source: '/reglages/saisie', destination: '/reglages/import-export', permanent: true },
    ];
  },
};

export default nextConfig;
