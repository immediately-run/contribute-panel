import { defineConfig } from 'vitest/config';

// Test config for the pure `SourceControlView` unit tests. Kept separate from
// vite.config.ts so the production build config stays plugin-clean and free of
// the vite-8 (rolldown) ⇄ vitest-bundled-vite plugin-type skew. No React plugin
// is needed here — esbuild's automatic JSX runtime handles the tsx transform, so
// `React` need not be in scope.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  server: { host: '127.0.0.1' }, // the worker VM's /etc/hosts has no `localhost` entry
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
