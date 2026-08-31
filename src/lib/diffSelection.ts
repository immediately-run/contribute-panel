// The sibling protocol + wire types for the Source activity's two halves
// (R3-478; the R3-391 `panel.tools`↔`mainpane.tools` idiom).
//
// `panel.contribute` and `mainpane.contribute-diff` are two sandboxed frames of
// this one program with NO shared memory. The host gives them a single §5.6 IPC
// edge to each other (and to nothing else); over it the panel sends exactly one
// message: "the user selected this changed file".
//
// The payload is UNTRUSTED on arrival even though the host attaches an
// unspoofable `from`: `parseSelectMessage` checks the sender is the panel and
// the shape is ours, and the receiver re-checks the path against the CURRENT
// `VcsState` changes before using it — a path the changeset doesn't name never
// becomes a diff fetch (defense in depth: the host's `vcs:diff` chroot would
// refuse an escape anyway; here even a well-formed-but-stale path is ignored).
import type { VcsChange, VcsState } from "@immediately-run/sdk";

export const PANEL_REGION = "panel.contribute";
export const DIFF_PANE_REGION = "mainpane.contribute-diff";

/** Bounds so a hostile sibling cannot make the receiver allocate without limit. */
export const MAX_PATH_LEN = 512;

/** The one message this app's halves exchange. */
export type SelectMessage = { v: 1; kind: "select"; path: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * Parse an inbound region message as a {@link SelectMessage}. Returns the path,
 * or `null` for anything else — wrong sender, wrong version, wrong kind, or a
 * path that is not a bounded non-empty string. `null` means "ignore silently":
 * the panel is first-party, but this frame treats what arrives as data.
 */
export function parseSelectMessage(from: string, data: unknown): string | null {
  if (from !== PANEL_REGION) return null;
  if (!isRecord(data)) return null;
  if (data.v !== 1 || data.kind !== "select") return null;
  const path = data.path;
  if (typeof path !== "string" || path.length === 0 || path.length > MAX_PATH_LEN) return null;
  if (path.includes("\0")) return null;
  return path;
}

/** The paths the CURRENT changeset names — the allow-list a selection must hit. */
export const changedPaths = (state: VcsState): Set<string> => new Set(state.changes.map((c: VcsChange) => c.path));

/**
 * The default selection: the first changed path, or `null` on a clean tree. The
 * pane always shows SOMETHING when there are changes — an unselected diff pane
 * next to a dirty tree would read as broken, not minimal.
 */
export function defaultSelection(state: VcsState): string | null {
  return state.changes.length > 0 ? state.changes[0].path : null;
}

/** The host `vcs:diff` reply (site-main `UnifiedDiffResult`, R3-332). Plain JSON. */
export interface VcsDiffReply {
  /** Unified diff text for this window. */
  text: string;
  /** 1-indexed first/last line of the whole diff this window covers. */
  startLine: number;
  endLine: number;
  /** Total lines in the whole diff — so truncation is never implicit. */
  totalLines: number;
  /** Offset to pass back to continue, or `null` at end of diff. */
  nextOffset: number | null;
  /** Per-path render notes — a binary/too-large/unreadable file says so HERE. */
  files: Array<{ path: string; status: string; rendered: "ok" | "binary" | "too-large" | "unreadable" }>;
}

/** How many diff lines to request per window (the host also byte-caps a window). */
export const DIFF_PAGE_LINES = 500;

/** One line of a unified diff, classified for rendering. Pure. */
export type DiffLineKind = "add" | "del" | "hunk" | "ctx";

export function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "ctx";
}

/** Split a window's text into renderable lines (no trailing-empty artifact). */
export function diffLines(text: string): string[] {
  return text.length === 0 ? [] : text.split("\n");
}

/** Parse and validate a `vcs:diff` reply, or `null` if the host's shape is wrong. */
export function parseDiffReply(v: unknown): VcsDiffReply | null {
  if (!isRecord(v)) return null;
  if (typeof v.text !== "string") return null;
  for (const k of ["startLine", "endLine", "totalLines"] as const) {
    if (typeof v[k] !== "number" || !Number.isFinite(v[k])) return null;
  }
  if (v.nextOffset !== null && !(typeof v.nextOffset === "number" && Number.isFinite(v.nextOffset))) return null;
  if (!Array.isArray(v.files)) return null;
  return v as unknown as VcsDiffReply;
}
