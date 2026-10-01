/// <reference types="vitest/globals" />
// R3-621 — the outward-link click handler. The SDK's openExternal is mocked; the
// href in the install case is read from the SAME prop the component passes (a
// `Phase` object), not a retyped string.
//
// Deviation from the item's literal test spec, recorded on the PR: the spec's
// "prevent the default when the call resolves / do not prevent on
// `unsupported`" cannot work in a real browser — the anchor's default
// navigation runs when the click dispatch completes, and the host's answer is a
// postMessage round-trip (a macrotask), so a post-await preventDefault never
// prevents. The handler prevents synchronously (the platformLink.tsx shape the
// item's Architecture section cites) and the `unsupported`/no-host cases
// navigate by hand via window.open — the anchor's own semantics. The live legs
// (R3-890) verify on the venue.
import { openExternalLink } from "./externalLink";
import type { Phase } from "../components/Contribute";

const { mockOpenExternal } = vi.hoisted(() => ({ mockOpenExternal: vi.fn() }));
vi.mock("@immediately-run/sdk", () => ({ openExternal: mockOpenExternal }));

const HREF = "https://github.com/apps/immediately-run/installations/new";

const fakeEvent = () => ({
  prevented: false,
  preventDefault() {
    this.prevented = true;
  },
});

const refusal = (code: string) => Object.assign(new Error(`refused: ${code}`), { code });

/** The SDK's no-host failure, verbatim: an UNCODED Error from the transport
 *  layer (`hostTransport.ts`'s transport()), not a coded refusal. */
const NO_HOST = new Error("immediately.run: no host transport (neither injected nor __immediatelyRun__)");

describe("openExternalLink", () => {
  beforeEach(() => {
    mockOpenExternal.mockReset();
  });

  it("on resolve: the default is prevented synchronously and the host is asked with the href", async () => {
    mockOpenExternal.mockResolvedValue(undefined);
    // The href comes from the same prop the component passes (Phase),
    // not a retyped literal.
    const phase: Phase = { kind: "needs-install", installUrl: HREF, targetOwner: "acme", targetRepo: "widgets" };
    const ev = fakeEvent();
    openExternalLink(phase.installUrl, ev);
    expect(ev.prevented).toBe(true);
    expect(mockOpenExternal).toHaveBeenCalledWith(HREF);
    await Promise.resolve(); // let the continuation settle
  });

  it("on `unsupported` (an older host): navigates with the anchor's own semantics via window.open", async () => {
    mockOpenExternal.mockRejectedValue(refusal("unsupported"));
    const opened = vi.spyOn(window, "open").mockImplementation(() => null);
    const ev = fakeEvent();
    openExternalLink(HREF, ev);
    await Promise.resolve();
    await Promise.resolve();
    expect(opened).toHaveBeenCalledWith(HREF, "_blank", "noreferrer");
    opened.mockRestore();
  });

  it("on the UNCODED no-host rejection (vite dev): the same fallback — a usable link, no raw error", async () => {
    mockOpenExternal.mockRejectedValue(NO_HOST);
    const opened = vi.spyOn(window, "open").mockImplementation(() => null);
    const onError = vi.fn();
    openExternalLink(HREF, fakeEvent(), onError);
    await Promise.resolve();
    await Promise.resolve();
    expect(opened).toHaveBeenCalledWith(HREF, "_blank", "noreferrer");
    expect(onError).not.toHaveBeenCalled();
    opened.mockRestore();
  });

  it.each(["declined", "no-activation"])("on `%s`: no error is surfaced (the user chose / no gesture)", async (code) => {
    mockOpenExternal.mockRejectedValue(refusal(code));
    const onError = vi.fn();
    const ev = fakeEvent();
    openExternalLink(HREF, ev, onError);
    expect(ev.prevented).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).not.toHaveBeenCalled();
  });

  it("on any other refusal (`unknown` here): the error message reaches the caller's sink", async () => {
    mockOpenExternal.mockRejectedValue(refusal("unknown"));
    const onError = vi.fn();
    openExternalLink(HREF, fakeEvent(), onError);
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith("refused: unknown");
  });

  it("on a non-Error throw: a generic message reaches the sink", async () => {
    mockOpenExternal.mockRejectedValue("boom");
    const onError = vi.fn();
    openExternalLink(HREF, fakeEvent(), onError);
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledWith("Could not open the link");
  });
});
