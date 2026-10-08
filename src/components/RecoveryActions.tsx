// The recovery actions a recoverable save error offers (CONTRIBUTE_SPEC §12,
// R3-994 / R3-984): one component beside the error message, driven by the pure
// `recoveryPlan` mapper. The buttons re-run the save through the app's `run`
// seam — the app owns the options (the mapper never builds them, so the §8.8
// force and the CT-6 resume stay the app's deliberate act).
import type { ContributeMode, ContributeOptions } from "@immediately-run/sdk";
import type { RecoveryPlan } from "../lib/recovery";

export interface RecoveryActionsProps {
  plan: Exclude<RecoveryPlan, null>;
  /** Re-run the save with these option overrides merged over the form's. */
  rerun: (over: Partial<ContributeOptions>) => void;
  /** Flip the save-mode radio to match a `switch-to-pr` re-run (the form must
   *  not lie about the mode the re-run uses). */
  setMode: (mode: ContributeMode) => void;
  /** §8.8: the force checkbox's state (only offered with a typed name). */
  forceUpdate: boolean;
  setForceUpdate: (v: boolean) => void;
}

export default function RecoveryActions({
  plan,
  rerun,
  setMode,
  forceUpdate,
  setForceUpdate,
}: RecoveryActionsProps) {
  switch (plan.action) {
    case "open-pr":
      // CT-6: the branch is already pushed — resume with the event's context,
      // unchanged, and never re-push.
      return (
        <button
          type="button"
          className="ct-retry"
          onClick={() =>
            rerun({ resume: { kind: "open-pr", context: plan.context } })
          }
        >
          Open the pull request
        </button>
      );
    case "switch-to-pr":
      // CT-3: a direct commit lost the fast-forward race — offer a new branch + PR.
      return (
        <button
          type="button"
          className="ct-retry"
          onClick={() => {
            setMode("pr");
            rerun({ mode: "pr" });
          }}
        >
          Save as a pull request instead
        </button>
      );
    case "use-different-name":
      return (
        <div className="ct-recovery-hint">
          <p>
            The branch name is already taken — edit it above and save again.
          </p>
          {plan.canForce && (
            <label className="ct-radio">
              <input
                type="checkbox"
                checked={forceUpdate}
                onChange={(e) => setForceUpdate(e.target.checked)}
              />
              Update the existing branch instead
            </label>
          )}
        </div>
      );
    case "retry":
      // The existing retry affordance is the Save button — nothing new renders.
      return null;
  }
}
