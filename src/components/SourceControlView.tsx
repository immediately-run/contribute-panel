// Pure presentational view for the source-control sidebar — takes the projected
// `VcsState` (from the host's `vcs:read` channel) plus a refresh + a confirmed
// reset callback, and renders the diff summary, branch header, and open-PR list.
// It owns ONLY presentation state (the reset arm-then-confirm toggle); every
// authority-bearing action is a prop the container wires to the SDK. Keeping it
// framework-only + side-effect-free makes it unit-testable without the host
// (mirrors the native `SourceControlPanel` UX it replaces).
import { useEffect, useState } from "react";
import type { VcsChange, VcsState } from "@immediately-run/sdk";
import "./SourceControlView.css";

/** How long the reset stays "armed" after the first click before it disarms. */
const RESET_CONFIRM_WINDOW_MS = 3000;

export interface SourceControlViewProps {
  state: VcsState;
  /** Ask the host to recompute the diff + re-poll PRs (a manual refresh). */
  onRefresh: () => void;
  /** The CONFIRMED reset — called only on the second (armed) click. Discards the
   *  working tree; the authority is the first-party `vcs:reset`, gated host-side. */
  onReset: () => void | Promise<void>;
  /** A changed file was selected — the container posts it to the main-pane diff
   *  half over the §5.6 IPC edge (R3-478). The path is repo-relative. */
  onSelectFile: (path: string) => void;
  /** The currently-selected path, if any — highlights the row (R3-478). The view
   *  itself holds no selection state; the panel half is the source of truth. */
  selectedPath?: string | null;
}

const STATUS_BADGE: Record<VcsChange["status"], string> = {
  created: "A",
  modified: "M",
  deleted: "D",
};

const STATUS_LABEL: Record<VcsChange["status"], string> = {
  created: "Added",
  modified: "Modified",
  deleted: "Deleted",
};

const ChangeGroup: React.FC<{
  status: VcsChange["status"];
  paths: string[];
  selectedPath?: string | null;
  onSelectFile?: (path: string) => void;
}> = ({ status, paths, selectedPath, onSelectFile }) => (
  <div className="scp-change-group">
    <div className="scp-change-group-hd">
      <span className="scp-change-badge" data-kind={status}>
        {STATUS_BADGE[status]}
      </span>
      <span>{STATUS_LABEL[status]}</span>
      <span className="scp-muted">{paths.length}</span>
    </div>
    {paths.map((p) => (
      <button
        key={p}
        type="button"
        className="scp-change-path"
        data-selected={selectedPath === p || undefined}
        title={p}
        onClick={() => onSelectFile?.(p)}
      >
        {p}
      </button>
    ))}
  </div>
);

export const SourceControlView: React.FC<SourceControlViewProps> = ({
  state,
  onRefresh,
  onReset,
  onSelectFile,
  selectedPath,
}) => {
  const { changes, branch, prs, diffLoading } = state;

  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    if (!confirmReset) return;
    const id = setTimeout(() => setConfirmReset(false), RESET_CONFIRM_WINDOW_MS);
    return () => clearTimeout(id);
  }, [confirmReset]);

  const created = changes.filter((c) => c.status === "created").map((c) => c.path);
  const modified = changes.filter((c) => c.status === "modified").map((c) => c.path);
  const deleted = changes.filter((c) => c.status === "deleted").map((c) => c.path);
  const totalChanges = changes.length;

  const onResetClick = async () => {
    if (!confirmReset) {
      // First click ARMS; the second (within the window) confirms. The host
      // additionally requires `confirm: true` on the wire (belt-and-braces, T22).
      setConfirmReset(true);
      return;
    }
    setConfirmReset(false);
    await onReset();
  };

  const branchLabel = branch ? branch.name : "no branch yet";

  return (
    <div className="scp">
      <div className="scp-hd">
        <span className="scp-title" title={branchLabel}>
          Source Control · {branchLabel}
        </span>
        <button
          type="button"
          className="scp-icon-btn"
          title="Refresh changes"
          onClick={onRefresh}
        >
          ↻
        </button>
      </div>

      <div className="scp-body">
        {branch && (
          <div className="scp-branch">
            <div className="scp-branch-line">
              Branched from{" "}
              <span className="scp-mono">{branch.parentRepo}</span>
              <span className="scp-muted">@</span>
              <span className="scp-mono">{branch.parentRef}</span>
              <span className="scp-muted"> (</span>
              <span className="scp-mono">{branch.parentCommitSha.slice(0, 7)}</span>
              <span className="scp-muted">)</span>
            </div>
            {branch.upstreamPushable === false && (
              <div className="scp-branch-sub">
                No push access upstream — save opens a pull request from your fork.
              </div>
            )}
          </div>
        )}

        {diffLoading && totalChanges === 0 && (
          <div className="scp-loading">Computing changes…</div>
        )}

        {!diffLoading && totalChanges === 0 && (
          <div className="scp-empty">
            <div className="scp-empty-msg">No changes to save.</div>
            <div className="scp-empty-sub">
              Edit files in the editor — they'll show up here.
            </div>
          </div>
        )}

        {totalChanges > 0 && (
          <div className="scp-changes">
            {created.length > 0 && (
              <ChangeGroup status="created" paths={created} selectedPath={selectedPath} onSelectFile={onSelectFile} />
            )}
            {modified.length > 0 && (
              <ChangeGroup status="modified" paths={modified} selectedPath={selectedPath} onSelectFile={onSelectFile} />
            )}
            {deleted.length > 0 && (
              <ChangeGroup status="deleted" paths={deleted} selectedPath={selectedPath} onSelectFile={onSelectFile} />
            )}
          </div>
        )}

        {prs.length > 0 && (
          <div className="scp-prs">
            <div className="scp-prs-title">PRs associated with this branch</div>
            {prs.map((pr) => (
              <a
                key={pr.number}
                href={pr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="scp-pr-row"
                title={pr.title}
              >
                <span>#{pr.number}</span>
                <span className="scp-pr-state" data-state={pr.state}>
                  {pr.draft && pr.state === "open" ? "draft" : pr.state}
                </span>
                <span className="scp-mono scp-pr-title">{pr.title}</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="scp-footer">
        <button
          type="button"
          className="scp-btn-secondary"
          disabled={totalChanges === 0}
          onClick={() => {
            void onResetClick();
          }}
          title={
            totalChanges === 0
              ? "Nothing to reset"
              : confirmReset
                ? "Click again to discard all local changes"
                : "Discard all local changes"
          }
        >
          {confirmReset ? "Click again to confirm" : "Reset"}
        </button>
      </div>
    </div>
  );
};

export default SourceControlView;
