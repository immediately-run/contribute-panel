import { describe, expect, it } from 'vitest';
import { saveOptions } from './saveOptions';

describe('saveOptions (R3-985)', () => {
  it('a valid branch name rides along in PR mode', () => {
    const r = saveOptions({ message: 'Fix the thing', branchName: 'feature/my-branch', mode: 'pr' });
    expect(r).toEqual({
      ok: true,
      options: { commitMessage: 'Fix the thing', mode: 'pr', branchName: 'feature/my-branch' },
    });
  });

  it('an empty branch name sends NO branchName — the host generates the default', () => {
    const r = saveOptions({ message: '', branchName: '   ', mode: 'pr' });
    expect(r).toEqual({ ok: true, options: { commitMessage: 'Update', mode: 'pr' } });
    expect('branchName' in (r as { options: object }).options).toBe(false);
  });

  it('an invalid name is refused with the validator reason, before the host is called', () => {
    const r = saveOptions({ message: 'x', branchName: 'feature/~bad:name', mode: 'pr' });
    expect(r).toEqual({ ok: false, reason: 'contains an invalid character' });
  });

  it('direct mode never sends a branchName, even a typed one', () => {
    const r = saveOptions({ message: 'x', branchName: 'feature/ignored', mode: 'direct' });
    expect(r).toEqual({ ok: true, options: { commitMessage: 'x', mode: 'direct' } });
  });

  it('direct mode IGNORES a stale invalid name — never validated, never sent, never blocks', () => {
    const r = saveOptions({ message: 'x', branchName: 'has space', mode: 'direct' });
    expect(r).toEqual({ ok: true, options: { commitMessage: 'x', mode: 'direct' } });
  });
});
