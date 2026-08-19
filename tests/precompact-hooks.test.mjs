/**
 * precompact-hooks.test.mjs — the plugin's PreCompact + post-compaction pair.
 *
 * These exist because a user should not have to REMEMBER to park. They do not
 * replace parking (a shell script cannot write down reasoning), but they
 * guarantee the objective state survives a compaction and that the next turn
 * knows where to find it.
 *
 * THE WIRING IS DELIBERATELY DUPLICATED. The docs list a plugin's hook location
 * as `hooks/hooks.json`; the working plugin measured on this machine declares
 * hooks in `.claude-plugin/plugin.json` instead. Rather than guess which one a
 * given Claude Code version reads — and ship a feature that silently never
 * fires — both are shipped, and BOTH SCRIPTS ARE IDEMPOTENT so a double
 * execution is harmless. That idempotence is asserted here rather than assumed,
 * because it is the whole reason the duplication is safe.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS = join(ROOT, 'plugins', 'mothy', 'hooks');
const SNAPSHOT = join(HOOKS, 'precompact-snapshot.sh');
const NOTICE = join(HOOKS, 'post-compaction-notice.sh');

function run(script, projectDir) {
  return execFileSync('bash', [script], {
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    encoding: 'utf8',
  });
}
const fresh = () => mkdtempSync(join(tmpdir(), 'mothy-precompact-'));

test('both wiring locations declare the same two events', () => {
  const hooksJson = JSON.parse(readFileSync(join(HOOKS, 'hooks.json'), 'utf8'));
  const pluginJson = JSON.parse(readFileSync(join(ROOT, 'plugins', 'mothy', '.claude-plugin', 'plugin.json'), 'utf8'));
  for (const src of [hooksJson, pluginJson.hooks]) {
    assert.ok(src, 'both hooks.json and plugin.json.hooks must exist');
    assert.ok(src.PreCompact, 'PreCompact must be declared');
    assert.ok(src.UserPromptSubmit, 'UserPromptSubmit must be declared');
    const s = JSON.stringify(src);
    assert.match(s, /CLAUDE_PLUGIN_ROOT/, 'must resolve paths via CLAUDE_PLUGIN_ROOT, not a relative path');
    assert.match(s, /\|\| true/, 'hook commands must be fail-open at the wiring level');
  }
});

test('snapshot writes the state file and exits 0 outside a git repo', () => {
  const dir = fresh();
  run(SNAPSHOT, dir); // execFileSync throws on non-zero — a throw IS the failure
  const out = join(dir, '.claude', 'precompact-state.md');
  assert.ok(existsSync(out));
  const text = readFileSync(out, 'utf8');
  assert.match(text, /not a git repository/, 'must say it could not read git, not omit the section');
});

test('snapshot declares what it does NOT contain', () => {
  const dir = fresh();
  run(SNAPSHOT, dir);
  const text = readFileSync(join(dir, '.claude', 'precompact-state.md'), 'utf8');
  assert.match(text, /MECHANICAL FACTS ONLY/);
  assert.match(text, /Absence here is[\s\S]{0,20}not evidence/,
    'a reader must not take an empty section as "nothing was in progress"');
});

test('snapshot is IDEMPOTENT — running it twice is indistinguishable from once', () => {
  const dir = fresh();
  run(SNAPSHOT, dir);
  const once = readFileSync(join(dir, '.claude', 'precompact-state.md'), 'utf8');
  run(SNAPSHOT, dir);
  const twice = readFileSync(join(dir, '.claude', 'precompact-state.md'), 'utf8');
  // Only the generated timestamp may differ; strip it before comparing.
  const strip = (s) => s.replace(/- generated: .*/, '');
  assert.equal(strip(twice), strip(once), 'a double execution must not append or duplicate');
});

test('notice fires exactly ONCE per snapshot, then goes quiet', () => {
  const dir = fresh();
  run(SNAPSHOT, dir);
  const first = run(NOTICE, dir);
  assert.match(first, /precompact-state\.md/, 'first run must point at the file');
  assert.equal(run(NOTICE, dir).trim(), '', 'second run must be silent — a per-turn reminder gets ignored');
  assert.equal(run(NOTICE, dir).trim(), '', 'and stay silent');
});

test('notice speaks again after a NEW compaction', async () => {
  const dir = fresh();
  run(SNAPSHOT, dir);
  run(NOTICE, dir);
  await new Promise((r) => setTimeout(r, 1100)); // filesystem mtime granularity
  run(SNAPSHOT, dir);                            // a new compaction
  assert.match(run(NOTICE, dir), /precompact-state\.md/, 'a fresh snapshot must be announced again');
});

test('notice is silent when no compaction has ever happened', () => {
  assert.equal(run(NOTICE, fresh()).trim(), '');
});

test('both hooks exit 0 when the project directory is unwritable', () => {
  const dir = fresh();
  chmodSync(dir, 0o500);
  try {
    run(SNAPSHOT, dir);
    run(NOTICE, dir);
  } finally {
    chmodSync(dir, 0o700);
  }
});

// ── Live Desktop run, 2026-08-19: the snapshot wrote to the wrong repo ──────
//
// Rich compacted a session on ~/Documents/hooktest2. The file landed at
//
//   ~/.claude/plugins/marketplaces/mothy-marketplace/.claude/precompact-state.md
//
// i.e. inside the plugin's OWN marketplace checkout. CLAUDE_PROJECT_DIR was
// unset, the hook's cwd was inside that checkout, and it is itself a git repo —
// so `git rev-parse --show-toplevel` returned a confident, wrong answer. The
// project looked exactly as though hooks had never run, and the file would have
// been destroyed by the next plugin update.
//
// The authoritative answer was on stdin the whole time: the hook payload's
// `cwd`. The script simply never read it.
// Behavioural, not a source grep. The first version of this test asserted the
// string HOOK_CWD appeared in the script — and would have stayed green over a
// fix that was completely inert, because the implementation reached for GNU
// `timeout`, which macOS does not have. A test that cannot tell a working fix
// from a dead one is not a guard.
test('snapshot prefers the hook payload cwd over a guessed git root', () => {
  const decoy = mkdtempSync(join(tmpdir(), 'decoy-repo-'));   // stands in for the marketplace checkout
  const project = mkdtempSync(join(tmpdir(), 'real-project-'));
  execFileSync('git', ['init', '-q'], { cwd: decoy });

  execFileSync('bash', [join(HOOKS, 'precompact-snapshot.sh')], {
    cwd: decoy,                                              // where the hook happens to stand
    input: JSON.stringify({ cwd: project, hook_event_name: 'PreCompact' }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: '', CLAUDE_PLUGIN_ROOT: '' },
  });

  assert.ok(existsSync(join(project, '.claude', 'precompact-state.md')),
    'the payload named the project; the snapshot must land there');
  assert.ok(!existsSync(join(decoy, '.claude', 'precompact-state.md')),
    'git rev-parse resolved the decoy repo — that answer must lose to the payload');
});

// The guard that catches this whole CLASS rather than this one instance. Any
// resolution strategy can land inside the plugin's own directory; none of them
// should ever be allowed to write there.
test('both hooks refuse to write inside the plugin directory', () => {
  for (const f of ['precompact-snapshot.sh', 'auto-park.mjs']) {
    assert.match(readFileSync(join(HOOKS, f), 'utf8'), /CLAUDE_PLUGIN_ROOT/,
      `${f} must refuse a resolved root inside CLAUDE_PLUGIN_ROOT — a park file `
      + 'there is invisible to the user and erased by the next plugin update');
  }
});

// The notice is injected as context on the user's next turn, so the assistant
// reads it as an instruction and — measured 2026-08-19 — spends that turn
// telling the user it read two files and found nothing in them. The user had
// asked for an acknowledgement of something unrelated.
//
// Housekeeping the user did not ask for must not consume their turn. This is a
// prose instruction, so a unit test can only assert it is PRESENT, not that a
// model obeys it; that is a weaker guarantee than usual and worth saying out
// loud rather than implying coverage the test does not have.
test('the post-compaction notice forbids narrating itself', () => {
  const msg = readFileSync(join(HOOKS, 'post-compaction-notice.sh'), 'utf8');
  assert.match(msg, /DO NOT NARRATE/,
    'without this the assistant reports its own housekeeping at the user');
  assert.match(msg, /housekeeping, not a user request/,
    'the notice must mark itself as machine-injected, or it reads as the user asking');
  // Each on its own line on purpose: an instruction wrapped across a newline
  // is easy to soften by reflowing, and reads as one long sentence a model can
  // treat as a single hedge rather than four separate prohibitions.
  for (const forbidden of ['Do not summarize them.', 'Do not mention compaction.']) {
    assert.ok(msg.includes(forbidden), `notice must forbid: ${forbidden}`);
  }
});
