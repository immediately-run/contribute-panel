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
// Timing note (why preventDefault is synchronous): an anchor's default
// navigation runs when the event dispatch completes — BEFORE any promise
// continuation — so preventing after `await openExternal(...)` could never
// prevent anything (the broken tab would open beside the good one). The click
// handler prevents up front, exactly as `PlatformLink` does, and the one case
// that should have used the anchor instead — an older host with no outward-link
// surface (`unsupported`) — navigates by hand with the anchor's own
// `window.open(href, '_blank')` semantics.
import { openExternal } from "@immediately-run/sdk";

/** Why the host refused (the SDK's OpenExternalError code union). Only the
 *  values with handling distinct from "surface it" are named. */
type OpenExternalErrorCode = "invalid" | "no-activation" | "declined" | "forbidden" | "unsupported" | "unknown";

/**
 * The click handler for an outward link. `ev.preventDefault()` runs
 * synchronously (see the module note); the host is asked inside the gesture.
 *
 * - resolved — the host opened the tab; the anchor does not navigate.
 * - `unsupported` — no host surface: navigate with the anchor's own semantics
 *   (`window.open(href, "_blank", "noreferrer")`), so an older host or
 *   `vite dev` keeps a working link.
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
    if (code === "unsupported") {
      window.open(href, "_blank", "noreferrer");
      return;
    }
    if (code === "declined" || code === "no-activation") return;
    onError?.(e instanceof Error ? e.message : "Could not open the link");
  });
}
