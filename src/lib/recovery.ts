// The save-error recovery mapper (CONTRIBUTE_SPEC §12, R3-994 / R3-984): an error
// event's `recovery` field plus "did the user type the branch name" decide what the
// error region offers next to the message. PURE, extracted from the component so
// every mapping — including the unknown and absent shapes — is unit-testable
// without a host (the saveOptions rule, R3-985).
import type { OpenPRResumeContext, RecoveryAction } from "@immediately-run/sdk";

/** What the error region renders beside the message. `null` ⇒ the bare message
 *  (the unknown/absent shape — no invented action). */
export type RecoveryPlan =
  | { action: "open-pr"; context: OpenPRResumeContext }
  | { action: "switch-to-pr" }
  | { action: "use-different-name"; canForce: boolean }
  | { action: "retry" }
  | null;

/** Map the error event to the recovery plan. `typedBranchName` is whether the
 *  user typed the branch name this session (an empty field means the host
 *  generated it, so §8.8's force-update is not the user's to offer). */
export function recoveryPlan(
  ev: { recovery?: RecoveryAction; openPR?: OpenPRResumeContext },
  typedBranchName: boolean,
): RecoveryPlan {
  switch (ev.recovery) {
    case "retry":
      return { action: "retry" };
    case "switch-to-pr":
      return { action: "switch-to-pr" };
    case "use-different-name":
      return { action: "use-different-name", canForce: typedBranchName };
    case "open-pr":
      // The context is minted by the host and passed back unchanged; a missing
      // context is an unknown shape, not an offerable resume — the bare message.
      return ev.openPR ? { action: "open-pr", context: ev.openPR } : null;
    default:
      return null;
  }
}
