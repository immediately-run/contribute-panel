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
