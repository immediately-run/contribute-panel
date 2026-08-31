// The Source activity's MAIN-PANE half (R3-478): renders the selected changed
// file's diff. Same repo as the panel, different region — `App.tsx` branches on
// `useRegion()` (the devtools one-repo-many-bindings idiom). The two halves are
// two frames with no shared memory; the selection arrives over their single
// §5.6 IPC edge and is re-validated here (`parseSelectMessage` + the current
// changeset) before it becomes a diff fetch.
//
// The diff itself comes from the host's `vcs:diff` catalog method (R3-332,
// `vcs:read`): unified-diff text the host computes from the COW layers, paged
// by line. No `DiffResult`, no raw bytes, no token ever crosses — this frame
// renders a projection and names no write intent at all.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke, onRegionMessage, useHostTheme, useRegion, useVcsState } from "@immediately-run/sdk";
import {
  DIFF_PAGE_LINES,
  type VcsDiffReply,
  changedPaths,
  classifyDiffLine,
  defaultSelection,
  diffLines,
  parseDiffReply,
  parseSelectMessage,
} from "../lib/diffSelection";
import "./DiffPane.css";

/** A load is only rendered while its key matches the live selection+changeset —
 *  a stale load (selection moved, tree changed) reads as "loading", never as a
 *  wrong diff. Windows are the appended `vcs:diff` pages. */
interface Loaded {
  key: string;
  windows: VcsDiffReply[];
  error: string | null;
}

/** The render note for the currently shown file, or "ok". */
const noteFor = (reply: VcsDiffReply, path: string): string => {
  const note = reply.files.find((f) => f.path === path);
  return note?.rendered ?? "ok";
};

const NOTE_TEXT: Record<string, string> = {
  binary: "Binary file — diff not shown.",
  "too-large": "File too large to diff inline.",
  unreadable: "The prior version of this file could not be read.",
};

export const DiffPane: React.FC = () => {
  const region = useRegion();
  const theme = useHostTheme();
  const state = useVcsState();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // The selected path: set by a panel row tap, defaulted to the first change so
  // the pane never idles empty next to a dirty tree, and dropped the moment the
  // path leaves the changeset (the change was saved/reverted — showing a stale
  // diff would be a lie).
  const [selected, setSelected] = useState<string | null>(null);
  const valid = useMemo(() => changedPaths(state), [state]);
  const effective = selected !== null && valid.has(selected) ? selected : defaultSelection(state);

  // The listener validates the arriving path against the LIVE changeset, but the
  // subscription must not churn on every state push — so it reads through a ref
  // kept current by an effect (never written during render).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    return onRegionMessage(({ from, data }) => {
      const path = parseSelectMessage(from, data);
      if (path === null) return;
      if (changedPaths(stateRef.current).has(path)) setSelected(path);
    });
  }, []);

  // Fetch the diff for the effective selection; re-fetch when the selection
  // changes OR the changeset's shape changes (a save/reflow produces new hunks
  // for the same path). All state writes happen in async callbacks, keyed by
  // what they were fetched FOR, so a superseded reply can never render.
  const changesKey = useMemo(() => state.changes.map((c) => `${c.status}:${c.path}`).join("|"), [state.changes]);
  const key = `${effective ?? ""}#${changesKey}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (effective === null) return;
    let cancelled = false;
    invoke<unknown>("vcs:diff", { path: effective, offset: 1, limit: DIFF_PAGE_LINES })
      .then((v) => {
        if (cancelled) return;
        const reply = parseDiffReply(v);
        if (!reply) {
          setLoaded({ key, windows: [], error: "The host returned a malformed diff." });
          return;
        }
        setLoaded({ key, windows: [reply], error: null });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoaded({ key, windows: [], error: e instanceof Error ? e.message : "The diff could not be loaded." });
      });
    return () => {
      cancelled = true;
    };
  }, [effective, changesKey, key]);

  const current = loaded !== null && loaded.key === key ? loaded : null;
  const first = current?.windows[0];
  const last = current?.windows[current.windows.length - 1];

  const loadMore = useCallback(() => {
    if (!current || current.error !== null || effective === null) return;
    const last = current.windows[current.windows.length - 1];
    if (!last || last.nextOffset === null) return;
    const offset = last.nextOffset;
    invoke<unknown>("vcs:diff", { path: effective, offset, limit: DIFF_PAGE_LINES })
      .then((v) => {
        const reply = parseDiffReply(v);
        if (!reply) return;
        setLoaded((cur) => (cur && cur.key === key ? { ...cur, windows: [...cur.windows, reply] } : cur));
      })
      .catch(() => {
        /* keep what we have; the paging affordance stays on the last window */
      });
  }, [current, key, effective]);

  const shownLines = useMemo(
    () => (first ? current!.windows.flatMap((w) => diffLines(w.text)) : []),
    [current, first],
  );
  const note = first && effective !== null ? noteFor(first, effective) : "ok";
  const statusOf = (p: string) => state.changes.find((c) => c.path === p)?.status;

  if (region !== "mainpane.contribute-diff") {
    // Guard: never render the pane half outside its own region.
    return null;
  }

  return (
    <div className="dp">
      <div className="dp-hd">
        <span className="dp-title">
          {effective !== null ? (
            <>
              <span className="dp-badge" data-kind={statusOf(effective)}>
                {statusOf(effective) === "created" ? "A" : statusOf(effective) === "deleted" ? "D" : "M"}
              </span>
              <span className="dp-path" title={effective}>
                {effective}
              </span>
            </>
          ) : (
            "Changes"
          )}
        </span>
        {first && effective !== null && note === "ok" && current?.error === null && (
          <span className="dp-muted">
            {first.totalLines} line{first.totalLines === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="dp-body">
        {effective === null && (
          <div className="dp-empty">
            <div className="dp-empty-msg">Nothing to show.</div>
            <div className="dp-empty-sub">
              Edit files in the editor — select a change in the Source panel to see its diff here.
            </div>
          </div>
        )}

        {effective !== null && !current && <div className="dp-status">Loading diff…</div>}
        {effective !== null && current && current.error !== null && (
          <div className="dp-status dp-error">{current.error}</div>
        )}

        {effective !== null && current && current.error === null && note !== "ok" && (
          <div className="dp-status">{NOTE_TEXT[note] ?? "Diff unavailable."}</div>
        )}

        {effective !== null && current && current.error === null && note === "ok" && shownLines.length === 0 && (
          <div className="dp-status">No textual changes.</div>
        )}

        {effective !== null && current && current.error === null && note === "ok" && shownLines.length > 0 && (
          <>
            <div className="dp-diff" role="table" aria-label={`Diff of ${effective}`}>
              {shownLines.map((line, i) => (
                <div key={i} className="dp-row" data-kind={classifyDiffLine(line)}>
                  <span className="dp-text">{line || " "}</span>
                </div>
              ))}
            </div>
            {last && last.nextOffset !== null && (
              <button type="button" className="dp-more" onClick={loadMore}>
                Show more ({last.endLine} of {last.totalLines} lines)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DiffPane;
