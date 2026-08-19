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
