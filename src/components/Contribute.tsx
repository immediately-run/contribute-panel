// The contribute dialog (UI_AS_APPS_SPEC §5.1). Reads the unsaved files via the
// elevated `editor:read` channel, lets the user write a message and pick PR vs
// direct commit, then drives the host's contribution orchestrator over the
// streamed `contribute()` call. Every privileged step — the GitHub API, the
// OAuth token, the fork/PR — stays on the host; this app only shows progress.
import { useCallback, useMemo, useState } from "react";
import {
  contribute,
  useEditorContext,
  type ContributeMode,
  type ContributionEvent,
  type ContributionResult,
} from "@immediately-run/sdk";
import "./Contribute.css";

type Phase =
  | { kind: "idle" }
  | { kind: "running"; stage: string }
  | { kind: "needs-install"; installUrl: string; targetOwner: string; targetRepo: string }
  | { kind: "done"; result: ContributionResult }
  | { kind: "error"; code: string; message: string };

// Friendly one-liners for the orchestrator stages (CONTRIBUTE_SPEC §15.7).
const STAGE_LABEL: Record<string, string> = {
  "auth-check": "Checking sign-in…",
  "diff-compute": "Computing your changes…",
  "permission-check": "Checking permissions…",
  "conflict-check": "Checking for conflicts…",
  "fork-prepare": "Preparing your fork…",
  "upload-blob": "Uploading files…",
  "create-tree": "Building the commit…",
  "create-commit": "Creating the commit…",
  "create-branch": "Creating the branch…",
  "create-pr": "Opening the pull request…",
  "commit-pushed": "Pushing the commit…",
  starting: "Starting…",
};

export default function Contribute() {
  const { dirtyPaths } = useEditorContext();
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<ContributeMode>("pr");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  const busy = phase.kind === "running";
  const nothingToSave = dirtyPaths.length === 0;

  const run = useCallback(async () => {
    setPhase({ kind: "running", stage: "starting" });
    try {
      const stream = contribute({ commitMessage: message.trim() || "Update", mode });
      let result: ContributionResult | undefined;
      for await (const ev of stream as AsyncGenerator<ContributionEvent, ContributionResult>) {
        if (ev.stage === "install-required") {
          // Forward-only v1 (§5.1): the GitHub App must be installed on the target.
          // Show the link; after installing, the user retries (a fresh stream).
          setPhase({
            kind: "needs-install",
            installUrl: ev.installUrl,
            targetOwner: ev.targetOwner,
            targetRepo: ev.targetRepo,
          });
          return;
        }
        if (ev.stage === "error") {
          setPhase({ kind: "error", code: "failed", message: ev.message });
          return;
        }
        if (ev.stage === "done") {
          result = ev as unknown as ContributionResult;
        }
        setPhase({ kind: "running", stage: ev.stage });
      }
      // The generator's RETURN value is the settled result; prefer it.
      setPhase({ kind: "done", result: result ?? ({ commitSha: "", treeSha: "", branchName: "", mode: "new-branch-pr" } as ContributionResult) });
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "unknown";
      setPhase({ kind: "error", code, message: (e as Error)?.message ?? "Save failed" });
    }
  }, [message, mode]);

  const errorHint = useMemo(() => {
    if (phase.kind !== "error") return null;
    switch (phase.code) {
      case "auth-required":
        return "Sign in to save your changes.";
      case "forbidden":
        return mode === "direct"
          ? "This app can't commit directly. Switch to a pull request."
          : "You don't have permission to save here.";
      case "no-target":
        return "There's nothing here that can be saved to GitHub.";
      case "conflict":
        return "Someone changed these files upstream — refresh and try again.";
      case "gone":
        return "The branch was deleted upstream.";
      default:
        return phase.message;
    }
  }, [phase, mode]);

  return (
    <div className="contribute">
      <header className="ct-hd">
        <span className="ct-title">Save your changes</span>
      </header>

      <section className="ct-changes">
        {nothingToSave ? (
          <p className="ct-empty">No unsaved changes.</p>
        ) : (
          <>
            <p className="ct-changes-h">
              {dirtyPaths.length} file{dirtyPaths.length === 1 ? "" : "s"} will be saved
            </p>
            <ul className="ct-filelist">
              {dirtyPaths.map((p) => (
                <li key={p} className="ct-file" title={p}>
                  {p}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <label className="ct-field">
        <span className="ct-label">Message</span>
        <input
          className="ct-input"
          value={message}
          placeholder="Describe your change"
          onChange={(e) => setMessage(e.target.value)}
          disabled={busy}
        />
      </label>

      <div className="ct-mode" role="radiogroup" aria-label="Save mode">
        <label className="ct-radio">
          <input
            type="radio"
            name="mode"
            checked={mode === "pr"}
            onChange={() => setMode("pr")}
            disabled={busy}
          />
          Pull request
        </label>
        <label className="ct-radio">
          <input
            type="radio"
            name="mode"
            checked={mode === "direct"}
            onChange={() => setMode("direct")}
            disabled={busy}
          />
          Commit directly
        </label>
      </div>

      <button
        type="button"
        className="ct-save"
        onClick={run}
        disabled={busy || nothingToSave}
      >
        {busy ? STAGE_LABEL[phase.stage] ?? "Saving…" : mode === "direct" ? "Commit" : "Open pull request"}
      </button>

      {phase.kind === "needs-install" && (
        <div className="ct-status ct-install">
          <p>
            Install the immediately.run GitHub App on{" "}
            <strong>
              {phase.targetOwner}/{phase.targetRepo}
            </strong>{" "}
            to save here.
          </p>
          <a className="ct-link" href={phase.installUrl} target="_blank" rel="noreferrer">
            Install…
          </a>{" "}
          <button type="button" className="ct-retry" onClick={run}>
            I've installed — retry
          </button>
        </div>
      )}

      {phase.kind === "done" && (
        <div className="ct-status ct-done">
          {phase.result.prUrl ? (
            <p>
              Pull request opened —{" "}
              <a className="ct-link" href={phase.result.prUrl} target="_blank" rel="noreferrer">
                #{phase.result.prNumber}
              </a>
            </p>
          ) : (
            <p>Committed {phase.result.commitSha.slice(0, 7)} to {phase.result.branchName}.</p>
          )}
        </div>
      )}

      {phase.kind === "error" && <div className="ct-status ct-error">{errorHint}</div>}
    </div>
  );
}
