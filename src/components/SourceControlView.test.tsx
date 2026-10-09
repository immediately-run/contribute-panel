/// <reference types="vitest/globals" />
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import type { VcsState } from "@immediately-run/sdk";
import { SourceControlView } from "./SourceControlView";

afterEach(cleanup);

const emptyState: VcsState = {
  changes: [],
  branch: null,
  prs: [],
  diffLoading: false,
};

const dirtyState: VcsState = {
  changes: [
    { path: "src/added.ts", status: "created" },
    { path: "README.md", status: "modified" },
    { path: "old.ts", status: "deleted" },
  ],
  branch: {
    name: "immediately-run/patch-1",
    parentRepo: "acme/widgets",
    parentRef: "main",
    parentCommitSha: "abcdef1234567890",
    upstreamPushable: false,
  },
  prs: [
    { number: 7, url: "https://github.com/acme/widgets/pull/7", title: "Fix typo", state: "open", draft: false },
  ],
  diffLoading: false,
};

describe("SourceControlView", () => {
  it("renders the changed files grouped by status, the branch header, and PR rows", () => {
    render(<SourceControlView state={dirtyState} onRefresh={() => {}} onReset={() => {}} />);
    expect(screen.getByText("src/added.ts")).toBeTruthy();
    expect(screen.getByText("README.md")).toBeTruthy();
    expect(screen.getByText("old.ts")).toBeTruthy();
    // branch lineage
    expect(screen.getByText("acme/widgets")).toBeTruthy();
    expect(screen.getByText("abcdef1")).toBeTruthy();
    // PR row links out
    const prLink = screen.getByText("Fix typo").closest("a");
    expect(prLink?.getAttribute("href")).toBe("https://github.com/acme/widgets/pull/7");
  });

  it("shows the empty state when there are no changes", () => {
    render(<SourceControlView state={emptyState} onRefresh={() => {}} onReset={() => {}} />);
    expect(screen.getByText("No changes to save.")).toBeTruthy();
  });

  it("arms reset on the first click and only calls onReset on the second", () => {
    const onReset = vi.fn();
    render(<SourceControlView state={dirtyState} onRefresh={() => {}} onReset={onReset} />);
    const btn = screen.getByRole("button", { name: "Reset" });
    // First click: arms, does NOT reset.
    fireEvent.click(btn);
    expect(onReset).not.toHaveBeenCalled();
    expect(screen.getByText("Click again to confirm")).toBeTruthy();
    // Second click: confirms.
    fireEvent.click(screen.getByText("Click again to confirm"));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("disarms reset after the confirm window elapses", () => {
    vi.useFakeTimers();
    const onReset = vi.fn();
    try {
      render(<SourceControlView state={dirtyState} onRefresh={() => {}} onReset={onReset} />);
      fireEvent.click(screen.getByRole("button", { name: "Reset" }));
      expect(screen.getByText("Click again to confirm")).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(3100);
      });
      // Re-armed label gone; a click now only re-arms rather than resetting.
      expect(screen.queryByText("Click again to confirm")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Reset" }));
      expect(onReset).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("disables reset when there is nothing to reset", () => {
    render(<SourceControlView state={emptyState} onRefresh={() => {}} onReset={() => {}} />);
    const btn = screen.getByRole("button", { name: "Reset" });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("R3-478: changed files are selectable — a row tap reports its path", () => {
    const onSelectFile = vi.fn();
    render(
      <SourceControlView state={dirtyState} onRefresh={() => {}} onReset={() => {}} onSelectFile={onSelectFile} />,
    );
    fireEvent.click(screen.getByText("README.md"));
    expect(onSelectFile).toHaveBeenCalledWith("README.md");
    fireEvent.click(screen.getByText("src/added.ts"));
    expect(onSelectFile).toHaveBeenCalledWith("src/added.ts");
  });

  it("R3-478: marks the currently-selected row", () => {
    render(
      <SourceControlView
        state={dirtyState}
        onRefresh={() => {}}
        onReset={() => {}}
        onSelectFile={() => {}}
        selectedPath="README.md"
      />,
    );
    const row = screen.getByText("README.md").closest("button");
    expect(row?.hasAttribute("data-selected")).toBe(true);
    const other = screen.getByText("src/added.ts").closest("button");
    expect(other?.hasAttribute("data-selected")).toBe(false);
  });
});

// R3-987: the VcsState facts — repo header, diff error, warnings, phantoms.
describe("SourceControlView — the VcsState facts (R3-987)", () => {
  const withTarget: VcsState = {
    ...dirtyState,
    target: {
      namespace: "acme",
      repository: "widgets",
      ref: "feature/x",
      refKind: "branch",
      commitSha: "deadbeefcafe",
      defaultBranch: "main",
    },
  };

  it("the repo header shows namespace/repository@ref and the loaded sha7", () => {
    render(<SourceControlView state={withTarget} onRefresh={() => {}} onReset={() => {}} />);
    expect(screen.getByText("acme/widgets@feature/x")).toBeTruthy();
    expect(screen.getByText("deadbee")).toBeTruthy();
  });

  it("a null commitSha shows the header without the 'Loaded from' line", () => {
    render(
      <SourceControlView
        state={{ ...withTarget, target: { ...withTarget.target!, commitSha: null } }}
        onRefresh={() => {}}
        onReset={() => {}}
      />,
    );
    expect(screen.getByText("acme/widgets@feature/x")).toBeTruthy();
    expect(screen.queryByText(/Loaded from/)).toBeNull();
  });

  it("an absent target renders exactly today's panel (no header)", () => {
    render(<SourceControlView state={dirtyState} onRefresh={() => {}} onReset={() => {}} />);
    expect(screen.queryByTestId("scp-repo-header")).toBeNull();
  });

  it("the diffError banner informs and does not lock the change list", () => {
    render(
      <SourceControlView
        state={{ ...dirtyState, diffError: "git diff exploded" }}
        onRefresh={() => {}}
        onReset={() => {}}
      />,
    );
    expect(screen.getByTestId("scp-diff-error").textContent).toContain("git diff exploded");
    // …and the last good change list still renders (informs, never locks).
    expect(screen.getByText("src/added.ts")).toBeTruthy();
  });

  it("the diffWarnings list renders each warning as path: message", () => {
    render(
      <SourceControlView
        state={{
          ...dirtyState,
          diffWarnings: [
            { kind: "phantom", path: ".immediately.run/x", message: "walked but excluded" },
            { kind: "other", path: "big.bin", message: "over the size cap" },
          ],
        }}
        onRefresh={() => {}}
        onReset={() => {}}
      />,
    );
    const list = screen.getByTestId("scp-diff-warnings");
    expect(list.textContent).toContain(".immediately.run/x: walked but excluded");
    expect(list.textContent).toContain("big.bin: over the size cap");
  });

  it("the phantom footer toggle shows and hides excludedPhantoms", () => {
    render(
      <SourceControlView
        state={{ ...dirtyState, excludedPhantoms: [".immediately.run/manifest.json"] }}
        onRefresh={() => {}}
        onReset={() => {}}
      />,
    );
    expect(screen.queryByTestId("scp-phantoms")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /show 1 excluded platform file/i }));
    expect(screen.getByTestId("scp-phantoms").textContent).toContain(".immediately.run/manifest.json");
    fireEvent.click(screen.getByRole("button", { name: /hide 1 excluded platform file/i }));
    expect(screen.queryByTestId("scp-phantoms")).toBeNull();
  });
});
