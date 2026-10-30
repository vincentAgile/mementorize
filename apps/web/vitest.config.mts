import { defineConfig } from 'vitest/config';

/**
 * Unit tests of the web app (MEM-106): plain functions and components
 * rendered to HTML, next to the code they test (`*.test.ts(x)`).
 */
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['{app,lib}/**/*.test.{ts,tsx}'],
  },
});
