# contribute-panel

The **source-control sidebar** as an [immediately.run](https://immediately.run)
app — the first-party system app bound to the `panel.contribute` chrome region
(UI_AS_APPS_SPEC §5.3; `migrate-sidebars-to-apps` Phase 06).

It is the app replacement for the native `SourceControlPanel`: it shows the
working-tree **diff** (changed files grouped by added / modified / deleted), the
**branch lineage** it was branched from, the **open PRs** for the current branch,
an **arm-then-confirm reset**, and an inline **save** (pull request or direct
commit) driven by the streamed `contribute()` call.

**No `DiffResult`, `FileSystem`, or OAuth token ever reaches this app.** The host
derives every projection from authenticated GitHub calls + the COW layers and
performs every privileged step (the diff compute, the fork, the PR, the reset);
this app only observes the plain-JSON `VcsState` the host pushes and *names*
intents the host performs.

## The `vcs` surface it consumes

- `useVcsState()` — the host-projected `{ changes, branch, prs, diffLoading }`
  snapshot (elevated `vcs:read`; empty until the host answers, and for any frame
  without the capability).
- `refreshDiff()` / `refreshPRs()` — ask the host to recompute / re-poll and push
  a fresh snapshot (gated `vcs:read`).
- `resetWorkingTree()` — DISCARD the working tree (COW writable wipe + journal
  clear). First-party-only `vcs:reset`; a fork/preview is refused at the gate. The
  arm-then-confirm UX lives here; the authority is gated host-side.
- `contribute()` — the unchanged save stream (PR / direct commit), reused from the
  `immediately-run/contribute` dialog pilot.

## Capabilities

`theme:read`, `formFactor:read`, `route:read`, `catalog:read`, `auth:status`,
`mounts:read`, `editor:read`, `vcs:read`, `vcs:reset`, `contribute:any`,
`contribute:direct` — declared in the host's build-default registry
(`immediately-run-site-main/src/registry/defaults.ts`). `vcs:reset` and
`contribute:direct` are first-party-only.

## Develop

```sh
npm install
npm run dev      # standalone (no host chrome / empty VcsState / no real save)
npm run build
npm test         # unit tests for the pure SourceControlView (reset UX, rendering)
```

Pop the hood: fork it, rebind the `panel.contribute` region to your fork, and the
source-control sidebar becomes yours.
