// R3-1189: the spend predicate over every member of the SDK's published
// ContributionEvent union — the component's one line stays untested-by-render.

import { describe, expect, it } from "vitest";
import { commitLanded } from "./transcriptSpend";
type AnyEvent = Parameters<typeof commitLanded>[0];

describe("commitLanded — the R-CT-8 spend trigger", () => {
  it("spends on the stages that prove the commit is on the remote", () => {
    expect(commitLanded({ stage: "commit-pushed" } as AnyEvent)).toBe(true);
    expect(commitLanded({ stage: "pr-updated" } as AnyEvent)).toBe(true);
    expect(commitLanded({ stage: "create-pr" } as AnyEvent)).toBe(true);
  });

  it("spends on a done that carries a commitSha, not on one that does not", () => {
    expect(commitLanded({ stage: "done", commitSha: "c".repeat(40) })).toBe(true);
    expect(commitLanded({ stage: "done" } as AnyEvent)).toBe(false);
  });

  it("create-branch spends NOTHING — the host yields it before the ref exists", () => {
    expect(commitLanded({ stage: "create-branch" } as AnyEvent)).toBe(false);
  });

  it("everything else keeps the tick", () => {
    for (const stage of ["auth-check", "create-commit", "error", "install-required", "switch-branch"]) {
      expect(commitLanded({ stage } as AnyEvent)).toBe(false);
    }
  });
});
