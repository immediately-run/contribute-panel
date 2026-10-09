// Container for the source-control sidebar. Wires the pure `SourceControlView`
// and the embedded `Contribute` save flow to the SDK's `vcs` surface
// (UI_AS_APPS_SPEC §5.3; migrate-sidebars Phase 06):
//   • `useVcsState()`      — the host-projected diff / branch / PR snapshot
//                            (elevated `vcs:read`; empty until the host answers)
//   • `refreshDiff()` /
//     `refreshPRs()`       — ask the host to recompute + re-push (gated `vcs:read`)
//   • `resetWorkingTree()` — discard the working tree (first-party `vcs:reset`)
// The COW/journal + OAuth token never cross; this frame only reacts to the pushed
// state and NAMES intents the host performs.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  postToRegion,
  refreshDiff,
  refreshPRs,
  resetWorkingTree,
  revealRegion,
  useHostTheme,
  useVcsState,
} from "@immediately-run/sdk";
import SourceControlView from "./SourceControlView";
import Contribute from "./Contribute";
import { DIFF_PANE_REGION, type SelectMessage } from "../lib/diffSelection";

// The host recomputes the diff only when asked, so the panel polls a refresh to
// keep the change list live as the user edits (mirrors the native panel's cadence).
const DIFF_REFRESH_MS = 1500;
// PR polling hits the network on the host — a slower cadence keeps rate-limit
// budget for the actual save.
const PR_REFRESH_MS = 15000;

export const SourceControlPanel: React.FC = () => {
  const state = useVcsState();
  const theme = useHostTheme();

  // Follow the host chrome theme (the design tokens key off `data-theme`).
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // A refresh action can reject (`no-target` when there is no host contribute
  // session — e.g. not in edit mode). Swallow it: the panel simply shows the
  // empty snapshot the SDK already holds.
  const swallow = (p: Promise<void>) => {
    void p.catch(() => {});
  };

  const onRefresh = useCallback(() => {
    swallow(refreshDiff());
    swallow(refreshPRs());
  }, []);

  const onReset = useCallback(async () => {
    try {
      await resetWorkingTree();
    } catch {
      // The confirmed reset failed (e.g. `no-target`). The subsequent diff push
      // reflects the true state; nothing destructive happened on our side.
    }
  }, []);

  // Poll the diff (fast) and PRs (slow) on their own intervals, guarding against
  // overlapping in-flight requests so a slow host doesn't queue a backlog.
  const diffInflight = useRef(false);
  useEffect(() => {
    const tick = async () => {
      if (diffInflight.current) return;
      diffInflight.current = true;
      try {
        await refreshDiff();
      } catch {
        /* no host session yet — ignore */
      } finally {
        diffInflight.current = false;
      }
    };
    void tick();
    const id = setInterval(() => void tick(), DIFF_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const prInflight = useRef(false);
  useEffect(() => {
    const tick = async () => {
      if (prInflight.current) return;
      prInflight.current = true;
      try {
        await refreshPRs();
      } catch {
        /* no host session yet — ignore */
      } finally {
        prInflight.current = false;
      }
    };
    void tick();
    const id = setInterval(() => void tick(), PR_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // R3-478 — a row tap selects the file whose diff the main-pane half shows.
  // The post crosses the panel's ONLY IPC edge; the reveal (a column transition
  // on mobile, a focus move on desktop) must ride the same user gesture — the
  // host reads transient activation and refuses a programmatic flip. Both may
  // reject when the edge/mount isn't there (e.g. a standalone dev boot); the
  // selection highlight still updates so the panel stays self-consistent.
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const onSelectFile = useCallback((path: string) => {
    setSelectedPath(path);
    const msg: SelectMessage = { v: 1, kind: "select", path };
    void postToRegion(DIFF_PANE_REGION, msg).catch(() => {});
    void revealRegion(DIFF_PANE_REGION).catch(() => {});
  }, []);

  return (
    <div className="scp-shell">
      <SourceControlView
        state={state}
        onRefresh={onRefresh}
        onReset={onReset}
        onSelectFile={onSelectFile}
        selectedPath={selectedPath}
      />
      <div className="scp-save-region">
        {/* R3-987: a truncated manifest locks saving OUT (CONTRIBUTE_SPEC §7);
            a missing one means there is nothing to save into. Either replaces
            the save form. Both absent → exactly today's form. */}
        {state.manifestTruncated ? (
          // CONTRIBUTE_SPEC §7's lockout copy, verbatim — truncation is a
          // property of repo size, so a "refresh" remedy would be a lie.
          <div className="scp-note" role="alert" data-testid="scp-truncated">
            This repository is too large to contribute from the browser — use GitHub
            or your own tools.
          </div>
        ) : state.manifestMissing ? (
          <div className="scp-note" role="status" data-testid="scp-no-manifest">
            This load has no manifest — saving is unavailable.
          </div>
        ) : (
          <Contribute />
        )}
      </div>
    </div>
  );
};

export default SourceControlPanel;
