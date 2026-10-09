/// <reference types="vitest/globals" />
// SourceControlPanel — R3-987: a truncated manifest locks saving out
// (CONTRIBUTE_SPEC §7) and a missing one has nothing to save into; either
// replaces the save form. Both absent → the form renders.
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@immediately-run/sdk", () => {
  let vcs: Record<string, unknown> = { changes: [], branch: null, prs: [], diffLoading: false };
  return {
    __setVcs: (next: Record<string, unknown>) => {
      vcs = next;
    },
    useVcsState: () => vcs,
    useHostTheme: () => "light",
    refreshDiff: vi.fn(async () => {}),
    refreshPRs: vi.fn(async () => {}),
    resetWorkingTree: vi.fn(async () => {}),
    postToRegion: vi.fn(async () => {}),
    revealRegion: vi.fn(async () => {}),
  };
});

// The embedded save flow is not under test here — the panel's choice to render
// it or a banner is. A stub keeps the container's test free of the form's own
// SDK surface (useEditorContext et al.).
vi.mock("./Contribute", () => ({
  default: () => <div data-testid="save-form">save form</div>,
}));

import SourceControlPanel from "./SourceControlPanel";

const sdk = (await import("@immediately-run/sdk")) as unknown as {
  __setVcs: (next: Record<string, unknown>) => void;
};

afterEach(() => {
  cleanup();
  sdk.__setVcs({ changes: [], branch: null, prs: [], diffLoading: false });
});

describe("SourceControlPanel — the save-form lockouts (R3-987)", () => {
  it("a truncated manifest replaces the save form with the truncation banner", () => {
    sdk.__setVcs({ changes: [], branch: null, prs: [], diffLoading: false, manifestTruncated: true });
    render(<SourceControlPanel />);
    expect(screen.getByTestId("scp-truncated").textContent).toContain(
      "too large to contribute from the browser",
    );
    expect(screen.queryByTestId("save-form")).toBeNull();
  });

  it("a missing manifest replaces the save form with the no-manifest state", () => {
    sdk.__setVcs({ changes: [], branch: null, prs: [], diffLoading: false, manifestMissing: true });
    render(<SourceControlPanel />);
    expect(screen.getByTestId("scp-no-manifest").textContent).toContain("no manifest");
    expect(screen.queryByTestId("save-form")).toBeNull();
  });

  it("truncated wins over missing (the lockout is the stronger state)", () => {
    sdk.__setVcs({ changes: [], branch: null, prs: [], diffLoading: false, manifestTruncated: true, manifestMissing: true });
    render(<SourceControlPanel />);
    expect(screen.getByTestId("scp-truncated")).toBeTruthy();
    expect(screen.queryByTestId("scp-no-manifest")).toBeNull();
  });

  it("both absent renders the save form (today's panel)", () => {
    render(<SourceControlPanel />);
    expect(screen.getByTestId("save-form")).toBeTruthy();
  });
});
