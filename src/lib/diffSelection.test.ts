/// <reference types="vitest/globals" />
import {
  MAX_PATH_LEN,
  classifyDiffLine,
  defaultSelection,
  diffLines,
  parseDiffReply,
  parseSelectMessage,
} from "./diffSelection";
import type { VcsState } from "@immediately-run/sdk";

const PANEL = "panel.contribute";

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

describe("parseSelectMessage (the §5.6 edge payload is untrusted)", () => {
  it("accepts the one well-formed shape from the panel", () => {
    expect(parseSelectMessage(PANEL, { v: 1, kind: "select", path: "src/added.ts" })).toBe("src/added.ts");
  });

  it("ignores any other sender — even a byte-identical payload", () => {
    const msg = { v: 1, kind: "select", path: "src/added.ts" };
    expect(parseSelectMessage("mainpane.tools", msg)).toBeNull();
    expect(parseSelectMessage("", msg)).toBeNull();
    expect(parseSelectMessage("stage.conversation", msg)).toBeNull();
  });

  it("ignores wrong version, wrong kind, and non-object payloads", () => {
    expect(parseSelectMessage(PANEL, { v: 2, kind: "select", path: "x" })).toBeNull();
    expect(parseSelectMessage(PANEL, { v: 1, kind: "run", path: "x" })).toBeNull();
    expect(parseSelectMessage(PANEL, "select")).toBeNull();
    expect(parseSelectMessage(PANEL, null)).toBeNull();
    expect(parseSelectMessage(PANEL, [1, 2])).toBeNull();
  });

  it("ignores paths that are not bounded non-empty strings", () => {
    expect(parseSelectMessage(PANEL, { v: 1, kind: "select", path: "" })).toBeNull();
    expect(parseSelectMessage(PANEL, { v: 1, kind: "select", path: 7 })).toBeNull();
    expect(parseSelectMessage(PANEL, { v: 1, kind: "select", path: "a\0b" })).toBeNull();
    expect(parseSelectMessage(PANEL, { v: 1, kind: "select", path: "x".repeat(MAX_PATH_LEN + 1) })).toBeNull();
  });
});

describe("defaultSelection", () => {
  it("is the first changed path on a dirty tree, null on a clean one", () => {
    expect(defaultSelection(dirty)).toBe("src/added.ts");
    expect(defaultSelection(clean)).toBeNull();
  });
});

describe("classifyDiffLine", () => {
  it("classifies unified-diff lines", () => {
    expect(classifyDiffLine("@@ -1,3 +1,4 @@")).toBe("hunk");
    expect(classifyDiffLine("+added line")).toBe("add");
    expect(classifyDiffLine("-removed line")).toBe("del");
    expect(classifyDiffLine(" context line")).toBe("ctx");
    expect(classifyDiffLine("diff --git a/x b/x")).toBe("ctx");
    expect(classifyDiffLine("")).toBe("ctx");
  });
});

describe("diffLines", () => {
  it("splits without a trailing empty artifact, and empty text is no lines", () => {
    expect(diffLines("+a\n-b")).toEqual(["+a", "-b"]);
    expect(diffLines("")).toEqual([]);
  });
});

describe("parseDiffReply (the host's answer is untrusted too)", () => {
  const ok = {
    text: "+a",
    startLine: 1,
    endLine: 1,
    totalLines: 1,
    nextOffset: null,
    files: [{ path: "a", status: "modified", rendered: "ok" }],
  };

  it("accepts a well-formed reply", () => {
    expect(parseDiffReply(ok)).toEqual(ok);
  });

  it("accepts a numeric nextOffset for paging", () => {
    expect(parseDiffReply({ ...ok, nextOffset: 501 })?.nextOffset).toBe(501);
  });

  it("refuses malformed shapes rather than rendering them", () => {
    expect(parseDiffReply(null)).toBeNull();
    expect(parseDiffReply("diff")).toBeNull();
    expect(parseDiffReply({ ...ok, text: 3 })).toBeNull();
    expect(parseDiffReply({ ...ok, totalLines: "many" })).toBeNull();
    expect(parseDiffReply({ ...ok, files: "all" })).toBeNull();
    expect(parseDiffReply({ ...ok, startLine: undefined })).toBeNull();
  });
});
