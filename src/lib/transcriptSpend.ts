// R3-1189 (R-CT-8 as amended): which contribute event proves a commit landed
// upstream — the one fact that spends the transcript tick. One home, both apps.

import type { ContributionEvent } from "@immediately-run/sdk";

/** The stages that prove the commit is on the remote: the PR path's ref lands at
 *  `create-pr` (after `createRef`, before `createPullRequest` — so a failed PR
 *  open does not resurrect the tick), a direct commit at `commit-pushed`, an
 *  extend at `pr-updated`. A `done` that carries a commitSha counts too (some
 *  producers yield the commit only there). `create-branch` does NOT: the host
 *  yields it before the ref exists, so a failed branch creation must keep the
 *  tick. */
export function commitLanded(ev: ContributionEvent): boolean {
  const stage = (ev as { stage?: string }).stage;
  if (stage === "commit-pushed" || stage === "pr-updated" || stage === "create-pr") return true;
  if (stage === "done") return Boolean((ev as { commitSha?: string }).commitSha);
  return false;
}
