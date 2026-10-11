/// <reference types="vitest/globals" />
// The recovery mapper (R3-994): every error-event shape plus the typed-name fact
// maps to the plan the error region renders — including the unknown/absent shapes
// (the bare message), the open-pr-without-context defensive shape, and the
// typed-vs-generated distinction §8.8's force-update rides on.
import { recoveryPlan, type RecoveryPlan } from "./recovery";
import type { OpenPRResumeContext } from "@immediately-run/sdk";

const context: OpenPRResumeContext = {
  pushOwner: "immediately-run",
  repository: "docs",
  branchName: "immediately-run/my-edit-abc1234",
  base: "main",
  head: "immediately-run:immediately-run/my-edit-abc1234",
};

describe("recoveryPlan (CONTRIBUTE_SPEC §12)", () => {
  it.each([
    ["retry", { recovery: "retry" } as const, { action: "retry" } as RecoveryPlan],
    ["switch-to-pr", { recovery: "switch-to-pr" } as const, { action: "switch-to-pr" } as RecoveryPlan],
  ])("maps %s to its action", (_name, ev, expected) => {
    expect(recoveryPlan(ev, false)).toEqual(expected);
    expect(recoveryPlan(ev, true)).toEqual(expected);
  });

  it("maps use-different-name with canForce only when the user typed the name", () => {
    expect(recoveryPlan({ recovery: "use-different-name" }, true)).toEqual({
      action: "use-different-name",
      canForce: true,
    });
    // An empty branch field means the host generated the name, so §8.8's
    // force-update is not the user's to offer — the hint points at the field.
    expect(recoveryPlan({ recovery: "use-different-name" }, false)).toEqual({
      action: "use-different-name",
      canForce: false,
    });
  });

  it("maps open-pr with the event's context, passed back unchanged", () => {
    expect(recoveryPlan({ recovery: "open-pr", openPR: context }, false)).toEqual({
      action: "open-pr",
      context,
    });
  });

  it("an open-pr with no context is the bare message, never an invented resume", () => {
    expect(recoveryPlan({ recovery: "open-pr" }, true)).toBeNull();
  });

  it("an absent or unknown recovery is the bare message", () => {
    expect(recoveryPlan({}, true)).toBeNull();
    expect(recoveryPlan({ recovery: "teleport" as never }, true)).toBeNull();
  });
});
