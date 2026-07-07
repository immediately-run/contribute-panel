import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The source-control sidebar — a first-party immediately.run system app bound to
// the `panel.contribute` chrome region (UI_AS_APPS_SPEC §5.3; migrate-sidebars
// Phase 06). It reads the working-tree diff / branch / open-PR state over the
// elevated `vcs:read` SDK channel and drives `refreshDiff`/`refreshPRs`/
// `resetWorkingTree` (first-party `vcs:reset`) — the COW/journal + OAuth token
// stay host-side. Tests are configured in vitest.config.ts. https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
});
