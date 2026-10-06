/// <reference types="vitest/globals" />
// Contribute (the save form) — R3-985: the branch-name input. Driven with a mocked
// SDK: a typed valid name rides along to contribute(), an invalid one shows the
// reason and disables save, an empty field sends no branchName, and the field is
// disabled while a save is in flight.
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@immediately-run/sdk", () => {
  let dirty: string[] = ["src/a.ts"];
  const contribute = vi.fn(async function* () {
    yield { stage: "done", commitSha: "c".repeat(40) };
  });
  return {
    __setDirty: (paths: string[]) => {
      dirty = paths;
    },
    contribute,
    useEditorContext: () => ({ dirtyPaths: dirty }),
    openExternal: vi.fn(async () => ({ ok: true })),
  };
});

import Contribute from "./Contribute";

const sdk = (await import("@immediately-run/sdk")) as unknown as {
  __setDirty: (paths: string[]) => void;
  contribute: ReturnType<typeof vi.fn>;
};

afterEach(() => {
  cleanup();
  sdk.contribute.mockClear();
  sdk.__setDirty(["src/a.ts"]);
});

const branchField = () => screen.getByPlaceholderText(/leave empty to use it/i) as HTMLInputElement;
const saveButton = () => screen.getByRole("button", { name: /open pull request/i }) as HTMLButtonElement;

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
    await screen.findByText(/pull request|committed/i, {}, { timeout: 2000 }).catch(() => {});
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
    expect(screen.getByText(/Invalid branch name: contains an invalid character/)).toBeTruthy();
    expect(saveButton().disabled).toBe(true);
    expect(sdk.contribute).not.toHaveBeenCalled();
  });

  it("an untouched field never shows the error", () => {
    render(<Contribute />);
    expect(screen.queryByText(/Invalid branch name/)).toBeNull();
    expect(saveButton().disabled).toBe(false);
  });

  async function waitForContribute() {
    await screen.findByText(/committed|pull request/i, {}, { timeout: 2000 }).catch(() => {});
    expect(sdk.contribute).toHaveBeenCalled();
  }
});
