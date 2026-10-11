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

  // R3-659 (CONTRIBUTE_TRANSCRIPT_SPEC §4 R-CT-5/6): the request hint.
  it('a requested transcript adds exactly transcriptRequested: true — nothing else transcript-shaped', () => {
    const r = saveOptions({ message: 'x', branchName: '', mode: 'pr', transcriptRequested: true });
    expect(r).toEqual({
      ok: true,
      options: { commitMessage: 'x', mode: 'pr', transcriptRequested: true },
    });
  });

  it('an unrequested transcript sends no hint key at all — false and absent alike', () => {
    for (const transcriptRequested of [false, undefined]) {
      const r = saveOptions({ message: 'x', branchName: '', mode: 'pr', transcriptRequested });
      expect(r).toEqual({ ok: true, options: { commitMessage: 'x', mode: 'pr' } });
      expect('transcriptRequested' in (r as { options: object }).options).toBe(false);
    }
  });

  it('the hint rides a direct-mode run too — the host, not the app, decides it gets no offer', () => {
    const r = saveOptions({ message: 'x', branchName: '', mode: 'direct', transcriptRequested: true });
    expect(r).toEqual({
      ok: true,
      options: { commitMessage: 'x', mode: 'direct', transcriptRequested: true },
    });
  });

  it('an invalid branch name still refuses the run when the hint is set', () => {
    const r = saveOptions({ message: 'x', branchName: 'has space', mode: 'pr', transcriptRequested: true });
    expect(r.ok).toBe(false);
  });
});
