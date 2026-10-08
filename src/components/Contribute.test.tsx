/// <reference types="vitest/globals" />
// Contribute (the save form) — R3-985: the branch-name input. Driven with a mocked
// SDK: a typed valid name rides along to contribute(), an invalid one shows the
// reason and disables save, an empty field sends no branchName, and the field is
// disabled while a save is in flight.
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";

vi.mock("@immediately-run/sdk", () => {
  let dirty: string[] = ["src/a.ts"];
  // R3-994: the double's stream is settable per test, so the recovery cases can
  // stream real error events (each `recovery` value, with and without the
  // open-pr context) and the done cases keep the default.
  let events: Record<string, unknown>[] = [
    { stage: "done", commitSha: "c".repeat(40) },
  ];
  const contribute = vi.fn(async function* () {
    for (const ev of events) yield { ...ev };
  });
  return {
    __setDirty: (paths: string[]) => {
      dirty = paths;
    },
    __setEvents: (next: Record<string, unknown>[]) => {
      events = next;
    },
    contribute,
    useEditorContext: () => ({ dirtyPaths: dirty }),
    openExternal: vi.fn(async () => ({ ok: true })),
  };
});

import Contribute from "./Contribute";

const sdk = (await import("@immediately-run/sdk")) as unknown as {
  __setDirty: (paths: string[]) => void;
  __setEvents: (events: Record<string, unknown>[]) => void;
  contribute: ReturnType<typeof vi.fn>;
};

afterEach(() => {
  cleanup();
  sdk.contribute.mockClear();
  sdk.__setDirty(["src/a.ts"]);
  sdk.__setEvents([{ stage: "done", commitSha: "c".repeat(40) }]);
});

const branchField = () =>
  screen.getByPlaceholderText(/leave empty to use it/i) as HTMLInputElement;
const saveButton = () =>
  screen.getByRole("button", {
    name: /open pull request/i,
  }) as HTMLButtonElement;

describe("Contribute — the branch-name input (R3-985)", () => {
  it("renders in PR mode, not in direct mode", () => {
    render(<Contribute />);
    expect(branchField()).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /commit directly/i }));
    expect(screen.queryByPlaceholderText(/leave empty to use it/i)).toBeNull();
  });

  it("a typed valid name is sent as branchName", async () => {
    render(<Contribute />);
    fireEvent.change(branchField(), { target: { value: "feature/my-branch" } });
    fireEvent.click(saveButton());
    await screen
      .findByText(/pull request|committed/i, {}, { timeout: 2000 })
      .catch(() => {});
    expect(sdk.contribute).toHaveBeenCalledWith(
      expect.objectContaining({ branchName: "feature/my-branch", mode: "pr" }),
    );
  });

  it("an empty field sends no branchName (the host generates the default)", async () => {
    render(<Contribute />);
    fireEvent.click(saveButton());
    await waitForContribute();
    const arg = sdk.contribute.mock.calls[0][0] as Record<string, unknown>;
    expect("branchName" in arg).toBe(false);
  });

  it("an invalid name shows the reason inline and disables save", () => {
    render(<Contribute />);
    fireEvent.change(branchField(), { target: { value: "feature/~bad:name" } });
    expect(
      screen.getByText(/Invalid branch name: contains an invalid character/),
    ).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    expect(sdk.contribute).not.toHaveBeenCalled();
  });

  it("an untouched field never shows the error", () => {
    render(<Contribute />);
    expect(screen.queryByText(/Invalid branch name/)).toBeNull();
    expect(saveButton().disabled).toBe(false);
  });

  it("the field is disabled while a save is in flight", async () => {
    // A never-settling stream holds the running phase.
    sdk.contribute.mockImplementationOnce(async function* () {
      yield { stage: "starting" };
      await new Promise(() => {});
    });
    render(<Contribute />);
    fireEvent.click(saveButton());
    await waitFor(() => expect(branchField().disabled).toBe(true));
  });

  it("a stale invalid name does not touch direct mode (round-1 review)", async () => {
    render(<Contribute />);
    fireEvent.change(branchField(), { target: { value: "has space" } });
    fireEvent.click(screen.getByRole("radio", { name: /commit directly/i }));
    // The error and the field are gone, and Commit is enabled.
    expect(screen.queryByText(/Invalid branch name/)).toBeNull();
    const commit = screen.getByRole("button", {
      name: /^commit$/i,
    }) as HTMLButtonElement;
    expect(commit.disabled).toBe(false);
    fireEvent.click(commit);
    await waitFor(() => expect(sdk.contribute).toHaveBeenCalled());
    const arg = sdk.contribute.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.mode).toBe("direct");
    expect("branchName" in arg).toBe(false);
  });

  async function waitForContribute() {
    await screen
      .findByText(/committed|pull request/i, {}, { timeout: 2000 })
      .catch(() => {});
    expect(sdk.contribute).toHaveBeenCalled();
  }
});

describe("Contribute — the recovery actions (R3-994, CONTRIBUTE_SPEC §12)", () => {
  const openPRContext = {
    pushOwner: "immediately-run",
    repository: "docs",
    branchName: "immediately-run/my-edit-abc1234",
    base: "main",
    head: "immediately-run:immediately-run/my-edit-abc1234",
  };

  it("an open-pr error renders the resume button, which re-sends the event's context unchanged", async () => {
    sdk.__setEvents([
      {
        stage: "error",
        message: "Opening the pull request failed",
        recoverable: true,
        recovery: "open-pr",
        openPR: openPRContext,
      },
    ]);
    render(<Contribute />);
    fireEvent.click(saveButton());
    const resume = await screen.findByRole("button", {
      name: /open the pull request/i,
    });
    fireEvent.click(resume);
    await screen
      .findByRole(
        "button",
        { name: /open pull request/i },
        {},
        { timeout: 2000 },
      )
      .catch(() => {});
    // The re-run carries the resume with the event's context, unchanged — and
    // never re-pushes (no fresh branchName options beyond the form's own).
    const call = sdk.contribute.mock.calls.at(-1)?.[0] as Record<
      string,
      unknown
    >;
    expect(call.resume).toEqual({ kind: "open-pr", context: openPRContext });
  });

  it("a switch-to-pr error re-invokes with mode 'pr' and flips the radio", async () => {
    sdk.__setEvents([
      {
        stage: "error",
        message: "Not a fast-forward",
        recoverable: true,
        recovery: "switch-to-pr",
      },
    ]);
    render(<Contribute />);
    fireEvent.click(screen.getByRole("radio", { name: /commit directly/i }));
    fireEvent.click(screen.getByRole("button", { name: /^commit$/i }));
    const switchBtn = await screen.findByRole("button", {
      name: /save as a pull request instead/i,
    });
    fireEvent.click(switchBtn);
    await waitFor(() => {
      const call = sdk.contribute.mock.calls.at(-1)?.[0] as Record<
        string,
        unknown
      >;
      expect(call.mode).toBe("pr");
    });
    // The form must not lie about the mode the re-run uses.
    expect(
      (screen.getByRole("radio", { name: /pull request/i }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("a use-different-name error with a typed name offers the §8.8 force, which rides the re-run", async () => {
    sdk.__setEvents([
      {
        stage: "error",
        message: "Branch already exists",
        recoverable: true,
        recovery: "use-different-name",
      },
    ]);
    render(<Contribute />);
    fireEvent.change(branchField(), { target: { value: "feature/my-branch" } });
    fireEvent.click(saveButton());
    await screen.findByText(/branch name is already taken/i);
    const box = screen.getByLabelText(
      /update the existing branch instead/i,
    ) as HTMLInputElement;
    expect(box).toBeTruthy();
    fireEvent.click(box);
    fireEvent.click(saveButton());
    await waitFor(() => {
      const call = sdk.contribute.mock.calls.at(-1)?.[0] as Record<
        string,
        unknown
      >;
      expect(call.forceUpdateBranch).toBe(true);
      expect(call.branchName).toBe("feature/my-branch");
    });
  });

  it("a use-different-name error with a generated name (empty field) shows the hint but no force checkbox", async () => {
    sdk.__setEvents([
      {
        stage: "error",
        message: "Branch already exists",
        recoverable: true,
        recovery: "use-different-name",
      },
    ]);
    render(<Contribute />);
    fireEvent.click(saveButton());
    await screen.findByText(/branch name is already taken/i);
    expect(
      screen.queryByLabelText(/update the existing branch instead/i),
    ).toBeNull();
  });

  it("an unknown or absent recovery renders the bare message and no action", async () => {
    sdk.__setEvents([
      { stage: "error", message: "Something else failed", recoverable: true },
    ]);
    render(<Contribute />);
    fireEvent.click(saveButton());
    await screen.findByText(/something else failed/i);
    expect(
      screen.queryByRole("button", {
        name: /open the pull request|save as a pull request/i,
      }),
    ).toBeNull();
    expect(screen.queryByLabelText(/update the existing branch/i)).toBeNull();
  });

  it("a retry error renders the message; the existing Save button is the retry affordance", async () => {
    sdk.__setEvents([
      {
        stage: "error",
        message: "Transient failure",
        recoverable: true,
        recovery: "retry",
      },
    ]);
    render(<Contribute />);
    fireEvent.click(saveButton());
    await screen.findByText(/transient failure/i);
    // The Save button re-runs unchanged — no new affordance, no forced options.
    fireEvent.click(saveButton());
    await waitFor(() => {
      const call = sdk.contribute.mock.calls.at(-1)?.[0] as Record<
        string,
        unknown
      >;
      expect(call.resume).toBeUndefined();
      expect(call.forceUpdateBranch).toBeUndefined();
    });
  });
});
