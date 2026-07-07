# contribute-panel — agent notes

The **source-control sidebar** immediately.run system app, bound to the
`panel.contribute` chrome region (UI_AS_APPS_SPEC §5.3; `migrate-sidebars-to-apps`
Phase 06; roadmap R3-52). It replaces the host-native `SourceControlPanel`.

## Architecture

- `src/App.tsx` — the default export immediately.run renders; mounts `SourceControlPanel`.
- `src/components/SourceControlPanel.tsx` — **container**: wires the SDK `vcs`
  surface (`useVcsState` / `refreshDiff` / `refreshPRs` / `resetWorkingTree`),
  follows the host theme (`useHostTheme` → `data-theme`), polls the diff (1.5s) and
  PRs (15s), and embeds the save flow.
- `src/components/SourceControlView.tsx` — **pure, side-effect-free view**: takes
  `VcsState` + `onRefresh` + `onReset`, renders the diff / branch / PR list, and
  owns only the reset arm-then-confirm toggle. Unit-tested in
  `SourceControlView.test.tsx` (no SDK/host needed).
- `src/components/Contribute.tsx` — the save flow, reused verbatim from the
  `immediately-run/contribute` dialog pilot (`contribute()` stream + `useEditorContext`).

## Invariants (do not break)

- **The OAuth token / `DiffResult` / `FileSystem` never cross the boundary.** The
  app only sees the plain-JSON `VcsState` the host projects (path + status only —
  no file bytes) and *names* intents; the host performs them.
- **Reset needs BOTH gates**: the first-party-only `vcs:reset` authority (host) AND
  the in-app two-click confirm. Keep the arm-then-confirm; the host also requires
  `confirm: true` on the wire.
- Capabilities are declared in the HOST registry, not this repo's `package.json`.

## Develop / verify

`npm install` · `npm run dev` (standalone: empty `VcsState`, no real save) ·
`npm run build` · `npm test` (vitest).
