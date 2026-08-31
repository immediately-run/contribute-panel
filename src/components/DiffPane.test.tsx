/// <reference types="vitest/globals" />
// DiffPane (R3-478) — the Source activity's main-pane half, driven with a mocked
// SDK: the pane must render the SELECTED changed file's diff from the host's
// `vcs:diff` projection, follow panel selections over the IPC edge, and ignore
// everything hostile or malformed (wrong sender, unknown path, bad reply shape).
import { render, screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import type { VcsState } from "@immediately-run/sdk";

vi.mock("@immediately-run/sdk", () => {
  let state: VcsState = { changes: [], branch: null, prs: [], diffLoading: false };
  let msgListener: ((m: { from: string; data: unknown }) => void) | null = null;
  const invoke = vi.fn();
  return {
    __setState: (s: VcsState) => {
      state = s;
    },
    __send: (from: string, data: unknown) => msgListener?.({ from, data }),
    useRegion: () => "mainpane.contribute-diff",
    useVcsState: () => state,
    useHostTheme: () => "dark",
    onRegionMessage: (l: (m: { from: string; data: unknown }) => void) => {
      msgListener = l;
      return () => {
        msgListener = null;
      };
    },
    invoke,
  };
});

import DiffPane from "./DiffPane";

// The mocked module's test controls (typed through the cast — the mock replaces
// the whole module surface).
const sdk = (await import("@immediately-run/sdk")) as unknown as {
  __setState: (s: VcsState) => void;
  __send: (from: string, data: unknown) => void;
  invoke: ReturnType<typeof vi.fn>;
};

const dirty: VcsState = {
  changes: [
    { path: "src/added.ts", status: "created" },
    { path: "README.md", status: "modified" },
  ],
  branch: null,
  prs: [],
  diffLoading: false,
};

const clean: VcsState = { changes: [], branch: null, prs: [], diffLoading: false };

const reply = (over: Record<string, unknown> = {}) => ({
  text: "@@ -1,1 +1,2 @@\n context\n+new line",
  startLine: 1,
  endLine: 3,
  totalLines: 3,
  nextOffset: null,
  files: [{ path: "src/added.ts", status: "created", rendered: "ok" }],
  ...over,
});

beforeEach(() => {
  sdk.invoke.mockReset();
  sdk.__setState(dirty);
});

afterEach(cleanup);

describe("DiffPane", () => {
  it("defaults to the first changed file and fetches its diff via vcs:diff", async () => {
    sdk.invoke.mockResolvedValue(reply());
    render(<DiffPane />);
    expect(sdk.invoke).toHaveBeenCalledWith("vcs:diff", { path: "src/added.ts", offset: 1, limit: 500 });
    await waitFor(() => expect(screen.getByText(/new line/)).toBeTruthy());
    expect(screen.getByText("3 lines")).toBeTruthy();
  });

  it("follows a panel selection over the IPC edge", async () => {
    sdk.invoke.mockResolvedValue(
      reply({ files: [{ path: "README.md", status: "modified", rendered: "ok" }] }),
    );
    render(<DiffPane />);
    await act(async () => {
      sdk.__send("panel.contribute", { v: 1, kind: "select", path: "README.md" });
    });
    expect(sdk.invoke).toHaveBeenLastCalledWith("vcs:diff", { path: "README.md", offset: 1, limit: 500 });
  });

  it("ignores a selection whose path the current changeset does not name", async () => {
    sdk.invoke.mockResolvedValue(reply());
    render(<DiffPane />);
    const calls = sdk.invoke.mock.calls.length;
    await act(async () => {
      sdk.__send("panel.contribute", { v: 1, kind: "select", path: "etc/passwd" });
    });
    expect(sdk.invoke.mock.calls.length).toBe(calls);
    expect(screen.getByText("src/added.ts")).toBeTruthy();
  });

  it("ignores a byte-identical selection from any other sender", async () => {
    sdk.invoke.mockResolvedValue(reply());
    render(<DiffPane />);
    const calls = sdk.invoke.mock.calls.length;
    await act(async () => {
      sdk.__send("stage.conversation", { v: 1, kind: "select", path: "README.md" });
    });
    expect(sdk.invoke.mock.calls.length).toBe(calls);
  });

  it("shows a clean-tree empty state and fetches nothing", () => {
    sdk.__setState(clean);
    render(<DiffPane />);
    expect(screen.getByText("Nothing to show.")).toBeTruthy();
    expect(sdk.invoke).not.toHaveBeenCalled();
  });

  it("pages a long diff via nextOffset", async () => {
    sdk.invoke
      .mockResolvedValueOnce(reply({ endLine: 500, totalLines: 900, nextOffset: 501 }))
      .mockResolvedValueOnce(reply({ startLine: 501, endLine: 900, totalLines: 900, nextOffset: null }));
    render(<DiffPane />);
    const more = await screen.findByRole("button", { name: /Show more/ });
    expect(more.textContent).toContain("500 of 900");
    fireEvent.click(more);
    await waitFor(() =>
      expect(sdk.invoke).toHaveBeenLastCalledWith("vcs:diff", { path: "src/added.ts", offset: 501, limit: 500 }),
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull());
  });

  it("says binary rather than showing nothing when the host cannot render the file", async () => {
    sdk.invoke.mockResolvedValue(reply({ text: "", files: [{ path: "src/added.ts", status: "created", rendered: "binary" }] }));
    render(<DiffPane />);
    await waitFor(() => expect(screen.getByText("Binary file — diff not shown.")).toBeTruthy());
  });

  it("refuses to render a malformed host reply", async () => {
    sdk.invoke.mockResolvedValue({ text: 3 });
    render(<DiffPane />);
    await waitFor(() => expect(screen.getByText(/malformed/i)).toBeTruthy());
  });

  it("surfaces a host error without inventing a diff", async () => {
    sdk.invoke.mockRejectedValue(Object.assign(new Error("no contribute session"), { code: "no-target" }));
    render(<DiffPane />);
    await waitFor(() => expect(screen.getByText("no contribute session")).toBeTruthy());
  });
});
