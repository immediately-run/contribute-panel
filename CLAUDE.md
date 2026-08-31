# contribute-panel — agent notes

The **source-control sidebar** immediately.run system app, bound to the
`panel.contribute` chrome region (UI_AS_APPS_SPEC §5.3; `migrate-sidebars-to-apps`
Phase 06; roadmap R3-52). It replaces the host-native `SourceControlPanel`.
Since R3-478 the same program also serves the `mainpane.contribute-diff` region
(the Source activity's main-pane half — see below).

## Architecture

- `src/App.tsx` — the default export immediately.run renders; branches on
  `useRegion()`: the sidebar half (`panel.contribute`) or the diff half
  (`mainpane.contribute-diff`), the `panel.tools`/`mainpane.tools` idiom.
- `src/components/SourceControlPanel.tsx` — **container**: wires the SDK `vcs`
  surface (`useVcsState` / `refreshDiff` / `refreshPRs` / `resetWorkingTree`),
  follows the host theme (`useHostTheme` → `data-theme`), polls the diff (1.5s) and
  PRs (15s), embeds the save flow, and posts file selections to the diff half.
- `src/components/SourceControlView.tsx` — **pure, side-effect-free view**: takes
  `VcsState` + `onRefresh` + `onReset` + `onSelectFile`, renders the diff / branch /
  PR list, and owns only the reset arm-then-confirm toggle. Unit-tested in
  `SourceControlView.test.tsx` (no SDK/host needed).
- `src/components/Contribute.tsx` — the save flow, reused verbatim from the
  `immediately-run/contribute` dialog pilot (`contribute()` stream + `useEditorContext`).
- `src/components/DiffPane.tsx` — the **main-pane half** (R3-478): renders the
  selected changed file's diff from the host's `vcs:diff` catalog method
  (`invoke('vcs:diff', {path, offset, limit})`, R3-332 — unified-diff text the
  host computes; paged by line). Selections arrive over the §5.6 IPC edge and are
  re-validated in `src/lib/diffSelection.ts` (sender + shape + the path must be in
  the CURRENT changeset) before any fetch.
- `src/lib/diffSelection.ts` — the sibling protocol (pure): the one `select`
  message, its bounds/validators, the `vcs:diff` reply parser, and line
  classification. Unit-tested without the SDK.

## Invariants (do not break)

- **The OAuth token / `DiffResult` / `FileSystem` never cross the boundary.** The
  app only sees the plain-JSON `VcsState` the host projects (path + status) and
  the paged unified-diff TEXT `vcs:diff` returns — never file bytes, never the
  token. The app *names* intents; the host performs them.
- **The diff half is read-only.** It holds `vcs:read` + `ipc` and nothing that
  writes (asserted host-side in site-main `defaults.test.ts`); it renders, never acts.
- **The IPC edge is exactly the two halves of this app.** The selection message is
  the only thing that crosses; its payload is untrusted on arrival and validated
  in `diffSelection.ts` before use.
- **Reset needs BOTH gates**: the first-party-only `vcs:reset` authority (host) AND
  the in-app two-click confirm. Keep the arm-then-confirm; the host also requires
  `confirm: true` on the wire.
- Capabilities are declared in the HOST registry, not this repo's `package.json`.

## Develop / verify

`npm install` · `npm run dev` (standalone: empty `VcsState`, no real save) ·
`npm run build` · `npm test` (vitest).
