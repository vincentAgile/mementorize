import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // The scenarios chain dozens of requests against a real database: on a
    // slow CI runner the default 5 s is not enough (a timeout once blocked a
    // deployment); a real hang still fails, after 20 s.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
