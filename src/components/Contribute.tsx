// The contribute dialog (UI_AS_APPS_SPEC §5.1). Reads the unsaved files via the
// elevated `editor:read` channel, lets the user write a message and pick PR vs
// direct commit, then drives the host's contribution orchestrator over the
// streamed `contribute()` call. Every privileged step — the GitHub API, the
// OAuth token, the fork/PR — stays on the host; this app only shows progress.
import { useCallback, useMemo, useState } from "react";
import {
  contribute,
  useEditorContext,
  useVcsState,
  type ContributeMode,
  type ContributeOptions,
  type ContributionEvent,
  type ContributionResult,
} from "@immediately-run/sdk";
import { openExternalLink } from "../lib/externalLink";
import { recoveryPlan, type RecoveryPlan } from "../lib/recovery";
import { BRANCH_NAME_PLACEHOLDER, saveOptions } from "../lib/saveOptions";
import RecoveryActions from "./RecoveryActions";
import "./Contribute.css";

/** The dialog's state machine. Exported (type-only) so the externalLink test
 *  reads its href from the same prop the component passes, never a retyped
 *  string (the item's Tests section). */
export type Phase =
  | { kind: "idle" }
  | { kind: "running"; stage: string }
  | {
      kind: "needs-install";
      installUrl: string;
      targetOwner: string;
      targetRepo: string;
    }
  | { kind: "done"; result: ContributionResult }
  // R3-994: the error phase carries the recovery plan (from the event's
  // `recovery` field + whether the branch name was typed) and the event's real
  // code when there is one — the event carries none, the catch path carries the
  // thrown one, and the hardcoded "failed" is gone.
  | { kind: "error"; code: string | null; message: string; plan: RecoveryPlan };

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
  // R3-994 (CONTRIBUTE_SPEC §8.8): the force-update checkbox, offered only after a
  // `use-different-name` error on a name the user typed; checked rides the
  // checkbox's own PR-mode re-run as forceUpdateBranch (the host's lineage gate
  // still decides) — a direct-mode run neither carries nor consumes it.
  const [forceUpdate, setForceUpdate] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [mode, setMode] = useState<ContributeMode>("pr");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  // R3-964/986 (CONTRIBUTE_SPEC §15.0): the save mode facts ride the host's
  // VcsState push — no app-side GitHub call. Absent facts render today's form.
  const vcs = useVcsState();
  // The default (rule 4) applies ONCE, when the fact first arrives; a choice the
  // user already made is never overwritten. (Adjusted during render, the
  // sanctioned pattern — an effect's setState is a cascading render, and this
  // app's lint refuses it. `undefined` initially, NOT the first render's
  // value, or a fact present from the start would never apply.)
  const [modeTouched, setModeTouched] = useState(false);
  const [appliedDefault, setAppliedDefault] = useState<typeof vcs.defaultSaveMode>(undefined);
  if (vcs.defaultSaveMode !== appliedDefault) {
    setAppliedDefault(vcs.defaultSaveMode);
    if (!modeTouched && vcs.defaultSaveMode) setMode(vcs.defaultSaveMode);
  }

  // Rule 1: an open PR on the loaded branch — the picker hides, the run updates it.
  const openPR = vcs.openPR ?? null;
  // Rule 2: a tag/commit load forces a PR against the default branch.
  const nonBranchTarget = (vcs.target ?? null) !== null && vcs.target!.refKind !== "branch";
  // Rule 3: no push access upstream forces the fork PR.
  const noPush = vcs.canPushUpstream === false;
  // …and while the probe is still out (null), the direct radio is disabled, not
  // hidden — the choice exists, its answer is not in yet.
  const pushUnknown = vcs.canPushUpstream === null;
  const directHidden = openPR !== null || nonBranchTarget || noPush;
  // A hidden radio can't stay checked (same render-time adjustment as above).
  if (directHidden && mode === "direct") setMode("pr");
  // A refused outward link (the install/PR anchors) renders here — BESIDE the
  // current phase, never instead of it: an error phase would unmount the very
  // link + retry the user needs.
  const [linkError, setLinkError] = useState<string | null>(null);

  const busy = phase.kind === "running";
  const nothingToSave = dirtyPaths.length === 0;
  // R3-985: validate the typed name once non-empty; an invalid one shows the reason
  // inline and disables save. An untouched/empty field never errors.
  // PR mode only: in direct mode the field is unmounted and a stale typed name
  // must not silently disable the commit (round-1 review).
  const branchCheck =
    mode === "pr" && branchName.trim() !== ""
      ? saveOptions({ message, branchName, mode })
      : null;
  const branchError =
    branchCheck && !branchCheck.ok ? branchCheck.reason : null;

  // R3-994: `over` is a recovery action's override — the CT-6 resume context, a
  // switch-to-pr mode, or nothing (the Save button's own re-run). The §8.8 force
  // rides as the checkbox state; every re-run goes through the same validation.
  const run = useCallback(
    async (over: Partial<ContributeOptions> = {}) => {
      // The mapping is saveOptions': a typed branch name rides along (validated
      // there), an empty field sends none (the host generates the default).
      // Validate BEFORE entering the running phase — the needs-install retry reaches
      // here unguarded, and a bail after setPhase would wedge the form (round-1 review).
      // A switch-to-pr override decides BEFORE saveOptions (round-1 review): the
      // render-time mode would discard the typed branch name the re-run must carry.
      const opts = saveOptions({
        message,
        branchName,
        mode: over.mode ?? mode,
      });
      // The bail is NOT unreachable (round-2 review): the Save button's
      // disabled-save guard holds for it, but the recovery buttons and the
      // needs-install retry reach here with a stale typed name that could be
      // invalid — the bail is the guard for those paths, wedging nothing.
      if (!opts.ok) return;
      setPhase({ kind: "running", stage: "starting" });
      // §8.8 (round-1 review): the force rides ONLY the checkbox's own re-run —
      // consume the checked state on EVERY run (round-3 review: a non-carrying run
      // must clear it too, or the box's residue attaches invisibly to a later
      // PR-mode save once the checkbox is unreachable). And only a PR-mode run can
      // carry it at all (round-2 review): §8.8 is about a caller-supplied branch
      // name, which a direct commit has none of — a checked box must not ride a
      // mode-flipped direct save.
      const forceThisRun = forceUpdate && (over.mode ?? mode) === "pr";
      if (forceUpdate) setForceUpdate(false);
      try {
        const stream = contribute({
          ...opts.options,
          ...over,
          ...(forceThisRun ? { forceUpdateBranch: true } : {}),
        });
        let result: ContributionResult | undefined;
        for await (const ev of stream as AsyncGenerator<
          ContributionEvent,
          ContributionResult
        >) {
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
            // R3-994: the plan comes from the event's `recovery` (+ the typed-name
            // fact); the code is the event's real one when present — it carries
            // none, so null (the hint map falls to the message), never "failed".
            setPhase({
              kind: "error",
              code: null,
              message: ev.message,
              // The typed-name fact is about the run that just failed — the mode it
              // used and the name it carried, not the render-time radio.
              plan: recoveryPlan(
                ev,
                branchName.trim() !== "" && (over.mode ?? mode) === "pr",
              ),
            });
            return;
          }
          if (ev.stage === "done") {
            result = ev as unknown as ContributionResult;
          }
          setPhase({ kind: "running", stage: ev.stage });
        }
        // The generator's RETURN value is the settled result; prefer it.
        setPhase({
          kind: "done",
          result:
            result ??
            ({
              commitSha: "",
              treeSha: "",
              branchName: "",
              mode: "new-branch-pr",
            } as ContributionResult),
        });
      } catch (e) {
        const code = (e as { code?: string })?.code ?? "unknown";
        // A refused resume (`forbidden`, the host's ledger refusing a context it
        // did not mint) lands here: the thrown message IS the description — a
        // canned permission hint would misdescribe it — so code null lets the
        // hint map fall to the message (round-1 review).
        setPhase({
          kind: "error",
          code: over.resume !== undefined ? null : code,
          message: (e as Error)?.message ?? "Save failed",
          plan: null,
        });
      }
    },
    [message, branchName, mode, forceUpdate],
  );

  const errorHint = useMemo(() => {
    if (phase.kind !== "error") return null;
    if (phase.code === null) return phase.message;
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
              {dirtyPaths.length} file{dirtyPaths.length === 1 ? "" : "s"} will
              be saved
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

      {mode === "pr" && !openPR && (
        <label className="ct-field">
          <span className="ct-label">Branch name</span>
          <input
            className="ct-input"
            value={branchName}
            placeholder={BRANCH_NAME_PLACEHOLDER}
            onChange={(e) => setBranchName(e.target.value)}
            disabled={busy}
          />
          {branchError && (
            <span className="ct-field-error">
              Invalid branch name: {branchError}
            </span>
          )}
        </label>
      )}

      {openPR ? (
        <div className="ct-note" role="status">
          Updating PR #{openPR.number}
          {vcs.target ? ` on branch ${vcs.target.ref}` : ""}.
        </div>
      ) : (
        <>
          {nonBranchTarget && vcs.target && (
            <div className="ct-note" role="status">
              PR will target default branch {vcs.target.defaultBranch ?? "…"} (loaded
              ref is a {vcs.target.refKind}).
            </div>
          )}
          {noPush && (
            <div className="ct-note" role="status">
              No push access to {vcs.target ? `${vcs.target.namespace}/${vcs.target.repository}` : "the upstream repository"}{" "}
              — the PR opens from your fork.
            </div>
          )}
          <div className="ct-mode" role="radiogroup" aria-label="Save mode">
            <label className="ct-radio">
              <input
                type="radio"
                name="mode"
                checked={mode === "pr"}
                onChange={() => {
                  setMode("pr");
                  setModeTouched(true);
                }}
                disabled={busy}
              />
              Pull request
            </label>
            {!directHidden && (
              <label className="ct-radio">
                <input
                  type="radio"
                  name="mode"
                  checked={mode === "direct"}
                  onChange={() => {
                    setMode("direct");
                    setModeTouched(true);
                  }}
                  disabled={busy || pushUnknown}
                />
                Commit directly
              </label>
            )}
          </div>
        </>
      )}

      <button
        type="button"
        className="ct-save"
        onClick={() => void run()}
        disabled={busy || nothingToSave || branchError !== null}
      >
        {busy
          ? (STAGE_LABEL[phase.stage] ?? "Saving…")
          : openPR
            ? `Update PR #${openPR.number}`
            : mode === "direct"
              ? "Commit"
              : "Open pull request"}
      </button>

      {phase.kind === "needs-install" && (
        <div className="ct-status ct-install" role="status">
          <p>
            Install the immediately.run GitHub App on{" "}
            <strong>
              {phase.targetOwner}/{phase.targetRepo}
            </strong>{" "}
            to save here.
          </p>
          <a
            className="ct-link"
            href={phase.installUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(ev) => {
              setLinkError(null);
              openExternalLink(phase.installUrl, ev, setLinkError);
            }}
          >
            Install…
          </a>{" "}
          <button type="button" className="ct-retry" onClick={() => void run()}>
            I've installed — retry
          </button>
        </div>
      )}

      {phase.kind === "done" && (
        <div className="ct-status ct-done" role="status">
          {phase.result.prUrl ? (
            <p>
              Pull request opened —{" "}
              <a
                className="ct-link"
                href={phase.result.prUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(ev) => {
                  setLinkError(null);
                  if (phase.result.prUrl)
                    openExternalLink(phase.result.prUrl, ev, setLinkError);
                }}
              >
                #{phase.result.prNumber}
              </a>
            </p>
          ) : (
            <p>
              Committed{" "}
              {vcs.target ? (
                <a
                  className="ct-link"
                  href={`https://github.com/${vcs.target.namespace}/${vcs.target.repository}/commit/${phase.result.commitSha}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(ev) => {
                    setLinkError(null);
                    openExternalLink(
                      `https://github.com/${vcs.target!.namespace}/${vcs.target!.repository}/commit/${phase.result.commitSha}`,
                      ev,
                      setLinkError,
                    );
                  }}
                >
                  {phase.result.commitSha.slice(0, 7)}
                </a>
              ) : (
                phase.result.commitSha.slice(0, 7)
              )}{" "}
              to {phase.result.branchName}.
            </p>
          )}
        </div>
      )}

      {phase.kind === "error" && (
        <div className="ct-status ct-error" role="alert">
          {errorHint}
          {phase.plan && (mode === "pr" || phase.plan.action !== "use-different-name") && (
            <RecoveryActions
              plan={phase.plan}
              rerun={run}
              setMode={setMode}
              forceUpdate={forceUpdate}
              setForceUpdate={setForceUpdate}
            />
          )}
        </div>
      )}
      {linkError && (
        <div className="ct-status ct-error" role="alert">
          {linkError}
        </div>
      )}
    </div>
  );
}
