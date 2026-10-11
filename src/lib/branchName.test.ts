// The rule table is the host's, verbatim: immediately-run-site-main
// src/workflows/contribute/branchName.test.ts. If one side changes, the other
// must too — the host validates authoritatively (CT-7), these copies are UX.
import { describe, expect, it } from 'vitest';
import { validateBranchName } from './branchName';

describe('validateBranchName', () => {
  const ok = ['immediately-run/edit-abc1234', 'feature/x', 'a/b/c', 'one.two.three', 'feature/-leading'];
  const bad: Array<[string, string]> = [
    ['', 'empty'],
    ['-leading', 'cannot start with "-"'],
    ['/leading', 'cannot start or end with "/"'],
    ['trailing/', 'cannot start or end with "/"'],
    ['.dotstart', 'cannot start or end with "."'],
    ['dotend.', 'cannot start or end with "."'],
    ['has..dotdot', 'cannot contain ".."'],
    ['@', 'cannot be just "@"'],
    ['has@{atbrace', 'cannot contain "@{"'],
    ['ends.lock', 'cannot end with ".lock"'],
    ['has space', 'contains an invalid character'],
    ['has~tilde', 'contains an invalid character'],
    ['has^caret', 'contains an invalid character'],
    ['has:colon', 'contains an invalid character'],
    ['has?question', 'contains an invalid character'],
    ['has*star', 'contains an invalid character'],
    ['has[bracket', 'contains an invalid character'],
    ['has\\back', 'contains an invalid character'],
    ['double//slash', 'cannot contain "//"'],
    // DEL (0x7f) is a control char git forbids, alongside the <0x20 range.
    ['has\x7fdel', 'contains an invalid character'],
    ['has\x01ctrl', 'contains an invalid character'],
    // Per-component dot/.lock rules apply to interior components too.
    ['feature/.hidden', 'a path component cannot start with "."'],
    ['foo.lock/bar', 'a path component cannot end with ".lock"'],
  ];

  it.each(ok)('accepts %s', (name) => {
    expect(validateBranchName(name)).toEqual({ ok: true });
  });

  it.each(bad)('rejects %s with reason "%s"', (name, reason) => {
    expect(validateBranchName(name)).toEqual({ ok: false, reason });
  });
});
