// openExternalLink — the ONE click handler for the panel's outward links
// (R3-621).
//
// A plain `<a target="_blank">` from inside the app frame opens a SANDBOXED tab
// (the frame's `allow-popups` without `allow-popups-to-escape-sandbox`), so the
// opened page runs at an opaque origin and anything that signs in or posts
// fails there — the GitHub App install flow refused its own re-authentication
// form from such a tab. The link therefore asks the HOST to open it
// (SDK `openExternal`, R3-619): the host validates the URL, confirms the
// destination in its own chrome, and opens a real tab.
//
// The `href` stays on the anchor: copy-link and middle-click are gestures the
// sandbox does allow, and with no host at all (`vite dev`) the anchor's own
// navigation is the correct behaviour (the same no-host fallback
// `platformLink.tsx` documents).
//
// Timing note (why preventDefault is synchronous): the host's answer is a
// postMessage round-trip — a macrotask — and an anchor's default navigation
// runs when the click dispatch completes, so a `preventDefault()` that waited
// for the answer could never prevent anything (the broken sandboxed tab would
// open beside the good one). The click handler prevents up front, exactly as
// `PlatformLink` does, and the cases that should have used the anchor instead
// — an older host with no outward-link surface (`unsupported`), or no host at
// all — navigate by hand with the anchor's own `window.open(href, '_blank')`
// semantics.
import { openExternal, type OpenExternalErrorCode } from "@immediately-run/sdk";

/** The no-host rejection's stable shape: the SDK's transport layer throws an
 *  UNCODED Error with this message when no host runtime exists (vite dev).
 *  Matched on the message — the SDK exports no code for it, and no public
 *  synchronous host probe exists today (TinkerableContext is not exported).
 *  If the SDK gains either, use it and delete this. */
const NO_HOST_TRANSPORT = "no host transport";

/**
 * The click handler for an outward link. `ev.preventDefault()` runs
 * synchronously (see the module note); the host is asked inside the gesture.
 *
 * - resolved — the host opened the tab; the anchor does not navigate.
 * - `unsupported`, or the uncoded no-host-transport rejection (vite dev) —
 *   navigate with the anchor's own semantics
 *   (`window.open(href, "_blank", "noreferrer")`), so an older host or no host
 *   keeps a working link.
 * - `declined` / `no-activation` — the user chose not to, or the click carried
 *   no gesture: leave the panel as it was, no error surfaced. (Never retried
 *   automatically — the next open needs the user's next gesture, by design.)
 * - anything else — surfaced to the caller's error sink (the panel's error
 *   line), never swallowed.
 */
export function openExternalLink(
  href: string,
  ev: { preventDefault(): void },
  onError?: (message: string) => void,
): void {
  ev.preventDefault();
  void openExternal(href).catch((e: unknown) => {
    const code = (e as { code?: unknown })?.code as OpenExternalErrorCode | undefined;
    const message = e instanceof Error ? e.message : "";
    if (code === "unsupported" || (code === undefined && message.includes(NO_HOST_TRANSPORT))) {
      window.open(href, "_blank", "noreferrer");
      return;
    }
    if (code === "declined" || code === "no-activation") return;
    onError?.(e instanceof Error ? e.message : "Could not open the link");
  });
}
