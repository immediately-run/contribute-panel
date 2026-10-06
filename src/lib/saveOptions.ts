// The form state → contribute() options mapping, extracted from the component so the
// branch-name rule is unit-testable (R3-985): a valid non-empty name rides along in PR
// mode, an empty field sends NO branchName (the host generates the default — the
// placeholder text is never a value), and an invalid name is refused before the host
// is called.
import type { ContributeMode, ContributeOptions } from '@immediately-run/sdk';
import { validateBranchName } from './branchName';

export type SaveOptionsInput = {
  message: string;
  branchName: string;
  mode: ContributeMode;
};

export type SaveOptions =
  | { ok: true; options: ContributeOptions }
  | { ok: false; reason: string };

export const BRANCH_NAME_PLACEHOLDER =
  'immediately-run/<message-slug>-<commit> — leave empty to use it';

export function saveOptions(input: SaveOptionsInput): SaveOptions {
  // The name is PR-mode only: direct commits land on the loaded branch, so a stale
  // typed name is IGNORED there — never validated, never sent (round-1 review: a
  // mode-blind validation silently disabled direct commits).
  const branchName = input.mode === 'pr' ? input.branchName.trim() : '';
  if (branchName !== '') {
    const v = validateBranchName(branchName);
    if (!v.ok) return { ok: false, reason: v.reason };
  }
  return {
    ok: true,
    options: {
      commitMessage: input.message.trim() || 'Update',
      mode: input.mode,
      // Empty sends NO branchName: the host generates the default — the placeholder
      // text is never a value.
      ...(branchName !== '' ? { branchName } : {}),
    },
  };
}
