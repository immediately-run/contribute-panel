// Branch-name validation, UX-side copy of the host's authoritative validator:
// immediately-run-site-main src/workflows/contribute/branchName.ts (CT-7 re-checks
// host-side — this copy only drives the form's inline error). Keep the rule table in
// branchName.test.ts identical to the host's. Rules per
// https://git-scm.com/docs/git-check-ref-format
export type BranchValidation = { ok: true } | { ok: false; reason: string };

// Spaces and control chars (NUL..SP, plus DEL 0x7f) — pulled out of the regex
// to avoid no-control-regex flagging the literal range. git check-ref-format
// forbids every byte below \040 as well as \177 (DEL). ~ ^ : ? * [ \ are the
// remaining single-char rejects in the spec.
const hasControlOrSpace = (name: string): boolean => {
  for (let i = 0; i < name.length; i++) {
    const code = name.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
};

const INVALID_BRANCH_PUNCTUATION = /[~^:?*[\\]/;

export const validateBranchName = (name: string): BranchValidation => {
  if (!name) return { ok: false, reason: 'empty' };
  if (name.startsWith('/') || name.endsWith('/')) {
    return { ok: false, reason: 'cannot start or end with "/"' };
  }
  if (name.startsWith('.') || name.endsWith('.')) {
    return { ok: false, reason: 'cannot start or end with "."' };
  }
  if (name.includes('..')) return { ok: false, reason: 'cannot contain ".."' };
  if (name.includes('@{')) return { ok: false, reason: 'cannot contain "@{"' };
  if (name === '@') return { ok: false, reason: 'cannot be just "@"' };
  if (name.endsWith('.lock')) return { ok: false, reason: 'cannot end with ".lock"' };
  if (hasControlOrSpace(name) || INVALID_BRANCH_PUNCTUATION.test(name)) {
    return { ok: false, reason: 'contains an invalid character' };
  }
  if (name.includes('//')) return { ok: false, reason: 'cannot contain "//"' };
  // Per-component rules: git applies "cannot begin with a dot" and "cannot end
  // with .lock" to EACH slash-separated component, not just the whole ref.
  for (const component of name.split('/')) {
    if (component.startsWith('.')) {
      return { ok: false, reason: 'a path component cannot start with "."' };
    }
    if (component.endsWith('.lock')) {
      return { ok: false, reason: 'a path component cannot end with ".lock"' };
    }
  }
  return { ok: true };
};
