/**
 * org-bundle.test.mjs — the Organization Skills copies must not lie.
 *
 * Org Skills serve Chat/Cowork; the plugin serves Claude Code. Uploading the
 * plugin's skills verbatim creates a SECOND executable copy on a surface that
 * has no hooks, no slash-command shims, no repo and no local binaries — and the
 * skills say otherwise in their own text. `proceed` promises three PreCompact
 * hooks and a `.claude/precompact-state.md` that will never exist there;
 * `plan`'s preflight STOPS unless a code project is open, which is wrong for a
 * non-code planning topic.
 *
 * That is not a cosmetic mismatch. It is exactly the bug class
 * plugin-freshness.test.mjs documents: a stale notice told an assistant a file
 * "does NOT contain reasoning", it believed the sentence, and never opened a
 * correct snapshot sitting on disk. A verbatim org copy of `proceed` rebuilds
 * that failure permanently, for a surface where the file never exists at all.
 *
 * THE LOAD-BEARING TEST IS "a missing anchor THROWS". The variants are produced
 * by cutting named sections out of the plugin copies. When someone renames a
 * heading during a re-sync, a forgiving builder would emit a variant that
 * silently still carries the hook promise — the upload would look fine, and the
 * lie would be back. The builder must fail the build instead.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ORG_BUNDLE, EXCLUDED, buildOrgSkill } from '../scripts/build-org-bundle.mjs';

const ROOT = join(import.meta.dirname, '..');
const SKILLS = join(ROOT, 'plugins', 'mothy', 'skills');
const VERSION = JSON.parse(
  readFileSync(join(ROOT, 'plugins', 'mothy', '.claude-plugin', 'plugin.json'), 'utf8')
).version;

const src = (name) => readFileSync(join(SKILLS, name, 'SKILL.md'), 'utf8');
const built = (name) => buildOrgSkill(name, src(name), VERSION);

// Pinned exactly, the way EXPECTED_COMMANDS pins the command shims: the bundle
// is a deliberate surface decision, not whatever happens to be in skills/.
const EXPECTED_BUNDLE = [
  'customer-brief', 'deck', 'edit-in-place', 'onboard', 'idea-intake',
  'prd', 'pr-faq', 'process-navigator', 'mc', 'evals',
  'proceed', 'plan',
];

test('the bundle is exactly the surface-appropriate set', () => {
  assert.deepEqual(Object.keys(ORG_BUNDLE).sort(), [...EXPECTED_BUNDLE].sort());
});

test('skills that cannot run on the org surface are excluded, with a stated reason', () => {
  // Local binaries (Playwright/ffmpeg/ElevenLabs), a runnable test suite, or
  // the Claude Code CLI itself. An org copy would advertise a capability the
  // surface cannot execute.
  for (const name of ['video', 'article', 'video-setup', 'build', 'fix', 'test',
                      'audit', 'connect', 'dev-setup', 'update-skills']) {
    assert.ok(!(name in ORG_BUNDLE), `${name} must stay plugin-only`);
    assert.ok(EXCLUDED[name], `${name}'s exclusion must carry a reason someone can read`);
  }
});

test('proceed: the org variant makes NO promise about hooks that cannot ship', () => {
  const out = built('proceed');
  for (const lie of ['installed with this plugin', '.claude/precompact-state.md',
                     'MOTHY_AUTOPARK', 'PreCompact']) {
    assert.ok(!out.includes(lie),
      `org proceed still claims "${lie}" — Org Skills carry no hooks, so it is false there`);
  }
  assert.match(out, /no automatic capture on this surface/i,
    'the variant must say plainly that parking here is manual');
  // The discipline itself must survive the cut.
  assert.ok(out.includes('Resume from the record, not from memory'));
});

test('plan: the org variant drops the repo preflight and the Workflow script', () => {
  const out = built('plan');
  assert.ok(!out.includes('desktop-preflight'), 'the repo-required STOP is wrong for a non-code plan');
  assert.ok(!out.includes('export const meta'), 'the Workflow boilerplate cannot run on this surface');
  assert.ok(!out.includes('Orchestration boilerplate'), 'its heading must go with it');
  // What makes /plan worth having must survive: independence, and the cross-check.
  assert.ok(out.includes("do not show a role the previous"), 'role independence is the whole point');
  assert.match(out, /conformance/i, 'the pre-synthesis cross-check must survive');
  assert.match(out, /sequentially in one\s+session/, 'the surviving orchestration shape is sequential');
});

test('every built skill carries the plugin version it was generated from', () => {
  // A stale org upload is otherwise indistinguishable from a current one.
  for (const name of EXPECTED_BUNDLE) {
    assert.ok(built(name).includes(`mothy plugin v${VERSION}`),
      `${name}'s org copy carries no version stamp — nobody could tell it is stale`);
  }
});

test('a product skill is passed through intact apart from the stamp', () => {
  const out = built('deck');
  const original = src('deck');
  for (const line of original.split('\n').filter((l) => l.startsWith('## '))) {
    assert.ok(out.includes(line), `deck lost section "${line}" — product skills are not edited`);
  }
});

test('LOAD-BEARING: a renamed anchor FAILS THE BUILD instead of shipping the lie', () => {
  const mutated = src('proceed').replace(
    '### It is automatic — you do not have to remember (installed with this plugin)',
    '### It is automatic (installed with this plugin)'
  );
  assert.notEqual(mutated, src('proceed'), 'the mutation must actually change the input');
  assert.throws(() => buildOrgSkill('proceed', mutated, VERSION), /anchor/i,
    'a forgiving builder would emit a variant that still promises the hooks');
});
