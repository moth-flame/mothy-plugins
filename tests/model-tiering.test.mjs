/**
 * model-tiering.test.mjs — §0.5 tiering must be REAL, not decorative prose.
 *
 * Each engineering skill already carries a "§0.5 — Model tiering" section
 * telling the orchestrator to run mechanical, read-only, high-volume calls on a
 * cheap/fast tier and keep the critics on the strong one. Every worked Workflow
 * script in those skills nonetheless passed NO model at all, so every scout,
 * every reproduction test and every suite run inherited the orchestrator's
 * model. The doctrine was in the prose and absent from the code anybody copies,
 * which is the same failure shape as a gate nobody arms.
 *
 * The load-bearing half is the second assertion. A later edit that widens the
 * worker tier onto the adversarial verifier, the test-audit critic or the
 * conformance reviewer would be invisible — the script still runs, the panel
 * still reports, and a weaker model silently blesses a bandaid. That is exactly
 * the call §0.5 says must stay expensive.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SKILLS_DIR = join(import.meta.dirname, '..', 'plugins', 'mothy', 'skills');
const TIERED_SKILLS = ['plan', 'build', 'fix', 'test'];

// Labels whose whole job is to disagree with work another agent produced.
// Never cheap. Matched against the `label:` on the same line as a `model:`.
const CRITIC_LABEL = /verify:|audit:|conformance|synthes/i;

// The skills differ in whitespace style on purpose (test/SKILL.md is dense).
const USES_WORKER = /model: *WORKER_MODEL/;

const read = (skill) => readFileSync(join(SKILLS_DIR, skill, 'SKILL.md'), 'utf8');

for (const skill of TIERED_SKILLS) {
  test(`${skill}: worked script defines the worker tier as one named constant`, () => {
    const src = read(skill);
    assert.ok(
      /const WORKER_MODEL = /.test(src),
      `${skill}/SKILL.md §0.5 promises a cheap/fast worker tier but its worked ` +
      `script defines no WORKER_MODEL constant, so nothing is ever tiered.`
    );
  });

  test(`${skill}: the worker tier is actually passed to agent() somewhere`, () => {
    const uses = read(skill).split('\n').filter((l) => USES_WORKER.test(l));
    assert.ok(
      uses.length >= 1,
      `${skill}/SKILL.md declares WORKER_MODEL and never passes it — decorative again.`
    );
  });

  test(`${skill}: no critic role runs on the worker tier`, () => {
    for (const line of read(skill).split('\n')) {
      if (!USES_WORKER.test(line)) continue;
      const label = line.match(/label: *`?([^`',]+)/)?.[1] ?? '';
      assert.ok(
        !CRITIC_LABEL.test(label),
        `${skill}/SKILL.md runs critic role "${label.trim()}" on the cheap worker ` +
        `tier. §0.5 keeps adversarial verification, the test audit and the ` +
        `conformance review on the strong tier — a weak critic blesses a bandaid.`
      );
    }
  });
}
