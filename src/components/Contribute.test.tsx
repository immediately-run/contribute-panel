/// <reference types="vitest/globals" />
// R3-659 (CONTRIBUTE_TRANSCRIPT_SPEC §4 R-CT-3/5/6/8): the "Commit session
// transcript" checkbox — rendered iff the host projects a qualifying
// agentSession, default-unchecked, spent on use, and a checked run sends
// exactly transcriptRequested: true.
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { VcsState } from "@immediately-run/sdk";
import Contribute from "./Contribute";

afterEach(cleanup);

let vcsState: VcsState;
let contributeCalls: Record<string, unknown>[];

vi.mock("@immediately-run/sdk", () => {
  return {
    useVcsState: () => vcsState,
    useEditorContext: () => ({ dirtyPaths: ["src/a.ts"] }),
    contribute: (opts: Record<string, unknown>) => {
      contributeCalls.push(opts);
      return (async function* () {
        yield { stage: "done", commitSha: "abc1234", treeSha: "t", branchName: "b", mode: "new-branch-pr" };
      })();
    },
  };
});

const NO_SESSION: VcsState = { changes: [], branch: null, prs: [], diffLoading: false };
const WITH_SESSION: VcsState = {
  ...NO_SESSION,
  agentSession: { repo: "acme/notes", conversationId: "c1", messageCount: 3, running: false },
};

const checkTheBox = async () => {
  fireEvent.click(screen.getByRole("checkbox", { name: "Commit session transcript" }));
  fireEvent.click(screen.getByRole("button", { name: "Open pull request" }));
  await waitFor(() => expect(screen.getByText(/Pull request opened|Committed/)).toBeTruthy());
};

describe("Contribute — the transcript request checkbox (R3-659)", () => {
  beforeEach(() => {
    contributeCalls = [];
    vcsState = WITH_SESSION;
  });

  it("renders iff VcsState.agentSession is present — absent, not disabled, otherwise (R-CT-3)", () => {
    render(<Contribute />);
    expect(screen.getByRole("checkbox", { name: "Commit session transcript" })).toBeTruthy();

    cleanup();
    vcsState = NO_SESSION;
    render(<Contribute />);
    expect(screen.queryByRole("checkbox", { name: "Commit session transcript" })).toBeNull();
    expect(screen.queryByText("Commit session transcript")).toBeNull();
  });

  it("is unchecked by default (R-CT-8)", () => {
    render(<Contribute />);
    expect((screen.getByRole("checkbox", { name: "Commit session transcript" }) as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it("a run with the box checked sends transcriptRequested: true and nothing else transcript-shaped", async () => {
    render(<Contribute />);
    await checkTheBox();
    expect(contributeCalls).toHaveLength(1);
    const params = contributeCalls[0];
    expect(params.transcriptRequested).toBe(true);
    expect(Object.keys(params).filter((k) => k.toLowerCase().includes("transcript"))).toEqual([
      "transcriptRequested",
    ]);
    expect(JSON.stringify(params)).not.toMatch(/buffer|bytes|path":/i);
  });

  it("a run with the box UNCHECKED sends no hint key at all", async () => {
    render(<Contribute />);
    fireEvent.click(screen.getByRole("button", { name: "Open pull request" }));
    await waitFor(() => expect(contributeCalls).toHaveLength(1));
    expect(contributeCalls[0]).not.toHaveProperty("transcriptRequested");
  });

  it("the hint is spent on use: a second run starts unchecked (R-CT-8)", async () => {
    render(<Contribute />);
    await checkTheBox();
    // After the run the box reads unchecked again…
    expect((screen.getByRole("checkbox", { name: "Commit session transcript" }) as HTMLInputElement).checked).toBe(
      false,
    );
    // …and the retry path re-sends nothing unless the user re-checks.
    fireEvent.click(screen.getByRole("button", { name: "Open pull request" }));
    await waitFor(() => expect(contributeCalls).toHaveLength(2));
    expect(contributeCalls[1]).not.toHaveProperty("transcriptRequested");
  });
});
