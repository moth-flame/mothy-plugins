/**
 * arm-push-gate.test.mjs — the SessionStart hook that ARMS a repo's own
 * pre-push gate.
 *
 * WHY THIS EXISTS. Git hooks are PER-CLONE and neither delivery mechanism
 * survives a clone on its own: `.git/hooks/*` lives inside `.git` and is never
 * cloned, and `core.hooksPath` pointing at a TRACKED directory makes the hook
 * FILES ride the checkout while the pointer itself stays in local git config —
 * also not cloned. So a fresh clone, and every cloud session, runs with no
 * pre-push gate at all, SILENTLY. That is how a money-moving repo got pushed
 * with its gate absent.
 *
 * The failure mode being fixed is NOT "no gate". It is "no gate, and nobody
 * could tell". Which is why the assertions below are weighted toward what the
 * hook says when it CANNOT arm anything, not toward the happy path.
 *
 * THE PROBE IS THE OTHER HALF. Asking whether `.git/hooks/pre-push` exists is a
 * FALSE NEGATIVE in a `core.hooksPath` repo — measured in the Mothy repo on
 * 2026-08-20, where that file does not exist and the gate is fully armed. Only
 * `git rev-parse --git-path hooks/pre-push` resolves `core.hooksPath`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decideArming, verdictAfterArming } from '../plugins/mothy/hooks/arm-push-gate.mjs';
import { readBothHookEventMaps } from './hook-wiring.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS = join(ROOT, 'plugins', 'mothy', 'hooks');
const SCRIPT = join(HOOKS, 'arm-push-gate.mjs');

// ── helpers ────────────────────────────────────────────────────────────────

/** A hermetic repo: `--template=` means NO .git/hooks at all, so nothing the
 *  user's own git template installed can make a test pass by accident. */
function scratchRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'armgate-'));
  execFileSync('git', ['init', '-q', '--template=', dir]);
  return dir;
}

function trackedHooks(dir, { name = '.githooks', executable = true } = {}) {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, 'pre-push'), '#!/bin/sh\nexit 0\n');
  chmodSync(join(dir, name, 'pre-push'), executable ? 0o755 : 0o644);
  return dir;
}

function installer(dir, body, rel = 'scripts/install-hooks.sh') {
  mkdirSync(join(dir, dirname(rel)), { recursive: true });
  writeFileSync(join(dir, rel), body);
  chmodSync(join(dir, rel), 0o755);
  return dir;
}

function run(dir, env = {}) {
  const res = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ cwd: dir, hook_event_name: 'SessionStart' }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, ...env },
  });
  // A hook that can block a session from starting is worse than no hook.
  assert.equal(res.status, 0, `the hook must always exit 0 (stderr: ${res.stderr})`);
  return String(res.stdout || '');
}

function hooksPathOf(dir) {
  const r = spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: dir, encoding: 'utf8' });
  return r.status === 0 ? String(r.stdout).trim() : null;
}

/** The ONLY correct liveness probe — resolves core.hooksPath. */
function effectiveHookArmed(dir) {
  const r = spawnSync('git', ['rev-parse', '--git-path', 'hooks/pre-push'], { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) return false;
  const p = resolve(dir, String(r.stdout).trim());
  if (!existsSync(p)) return false;
  return spawnSync('test', ['-x', p]).status === 0;
}

const OBS = {
  killSwitch: undefined,
  insideWorkTree: true,
  repoRoot: '/r',
  effectiveHook: { path: '/r/.git/hooks/pre-push', exists: false, executable: false },
  configuredHooksPath: null,
  configuredHooksPathResolved: null,
  trackedHooksDirs: [],
  installers: [],
  declaresGate: false,
  searchedHooksDirs: ['.githooks', 'githooks'],
  searchedInstallers: ['scripts/install-hooks.sh'],
};
const obs = (over) => ({ ...OBS, ...over });

// ── the decision table, as a pure function ─────────────────────────────────

test('kill switch: an off-value disables arming entirely', () => {
  for (const v of ['0', 'off', 'false', 'no', 'OFF']) {
    const d = decideArming(obs({
      killSwitch: v,
      trackedHooksDirs: [{ dir: '.githooks', absolute: '/r/.githooks', prePushExists: true, prePushExecutable: true }],
    }));
    assert.equal(d.action, 'disabled', `${v} must disable`);
    assert.equal(d.arm, false, 'a disabled run must not arm anything');
  }
  // Default ON — a gate nobody arms is the status quo being fixed.
  assert.notEqual(decideArming(obs({ killSwitch: undefined })).action, 'disabled');
  assert.notEqual(decideArming(obs({ killSwitch: '1' })).action, 'disabled');
});

test('not a git work tree — silent no-op', () => {
  const d = decideArming(obs({ insideWorkTree: false, declaresGate: true }));
  assert.equal(d.action, 'not_a_repo');
  assert.equal(d.message, '', 'nothing to say outside a repo');
  assert.equal(d.arm, false);
});

test('an effective pre-push hook already exists — nothing to do, silently', () => {
  const d = decideArming(obs({
    effectiveHook: { path: '/r/.githooks/pre-push', exists: true, executable: true },
    trackedHooksDirs: [{ dir: '.githooks', absolute: '/r/.githooks', prePushExists: true, prePushExecutable: true }],
  }));
  assert.equal(d.action, 'already_armed');
  assert.equal(d.arm, false, 'must not rewrite config for a repo that is already armed');
  assert.equal(d.message, '');
});

test('a hook that exists but is NOT executable is not "already armed"', () => {
  const d = decideArming(obs({
    effectiveHook: { path: '/r/.githooks/pre-push', exists: true, executable: false },
    trackedHooksDirs: [{ dir: '.githooks', absolute: '/r/.githooks', prePushExists: true, prePushExecutable: false }],
  }));
  assert.equal(d.action, 'arm_hooks_path', 'git will not run a non-executable hook');
});

test('an explicit core.hooksPath pointing elsewhere is an operator choice — never overridden', () => {
  const d = decideArming(obs({
    configuredHooksPath: '/opt/team-hooks',
    configuredHooksPathResolved: '/opt/team-hooks',
    trackedHooksDirs: [{ dir: '.githooks', absolute: '/r/.githooks', prePushExists: true, prePushExecutable: true }],
    declaresGate: true,
  }));
  assert.equal(d.action, 'respect_explicit_hooks_path');
  assert.equal(d.arm, false, 'overriding a deliberate operator pointer is not ours to do');
});

test('an explicit core.hooksPath that IS the tracked dir still gets armed/fixed', () => {
  const d = decideArming(obs({
    configuredHooksPath: '.githooks',
    configuredHooksPathResolved: '/r/.githooks',
    trackedHooksDirs: [{ dir: '.githooks', absolute: '/r/.githooks', prePushExists: true, prePushExecutable: false }],
  }));
  assert.equal(d.action, 'arm_hooks_path');
});

test('a tracked hooks dir with a pre-push is armed, and the result must be re-probed', () => {
  const d = decideArming(obs({
    trackedHooksDirs: [{ dir: '.githooks', absolute: '/r/.githooks', prePushExists: true, prePushExecutable: true }],
  }));
  assert.equal(d.action, 'arm_hooks_path');
  assert.equal(d.dir, '.githooks');
  assert.equal(d.arm, true);
  assert.equal(d.reprobe, true, 'arming without confirming it took is a claim, not a verdict');
});

test('a tracked hooks dir with NO pre-push is not a candidate', () => {
  const d = decideArming(obs({
    trackedHooksDirs: [{ dir: '.githooks', absolute: '/r/.githooks', prePushExists: false, prePushExecutable: false }],
    installers: ['scripts/install-hooks.sh'],
  }));
  assert.equal(d.action, 'run_installer');
});

test('a known installer is run when there is no tracked hooks dir', () => {
  const d = decideArming(obs({ installers: ['scripts/install-hooks.sh'] }));
  assert.equal(d.action, 'run_installer');
  assert.equal(d.installer, 'scripts/install-hooks.sh');
  assert.equal(d.reprobe, true, "the installer's exit code is never the verdict");
});

test('nothing to arm, but the repo MANDATES a gate — WARN, naming what was looked for', () => {
  const d = decideArming(obs({ declaresGate: true }));
  assert.equal(d.action, 'warn_no_gate');
  assert.equal(d.arm, false);
  assert.match(d.message, /pre-push/i);
  assert.match(d.message, /\.githooks/, 'must name every path it looked for');
  assert.match(d.message, /scripts\/install-hooks\.sh/);
});

test('nothing to arm and the repo declares nothing — stay SILENT', () => {
  const d = decideArming(obs({ declaresGate: false }));
  assert.equal(d.action, 'silent_no_gate');
  assert.equal(d.message, '', 'unsolicited noise in every unrelated repo is how a real warning gets ignored');
});

test('NEVER synthesizes: no decision branch asks for a hook to be written', () => {
  const shapes = [
    obs({}),
    obs({ declaresGate: true }),
    obs({ installers: [] , declaresGate: true }),
    obs({ trackedHooksDirs: [{ dir: '.githooks', absolute: '/r/.githooks', prePushExists: false, prePushExecutable: false }] }),
  ];
  for (const s of shapes) {
    const d = decideArming(s);
    assert.ok(!('write' in d) && !('content' in d) && !('synthesize' in d),
      'a guessed test command would block every push in that repo with a confusing error');
    assert.notEqual(d.action, 'arm_hooks_path', 'nothing here authored a pre-push hook');
  }
});

// ── the re-probe is the verdict, not the exit code ─────────────────────────

test('verdictAfterArming: only a confirming re-probe counts as armed', () => {
  const ok = verdictAfterArming(
    { action: 'arm_hooks_path', dir: '.githooks' },
    { path: '/r/.githooks/pre-push', exists: true, executable: true },
  );
  assert.equal(ok.armed, true);
  assert.match(ok.message, /\.githooks/);
});

test('verdictAfterArming: an unconfirmed arm WARNS — it must not claim success', () => {
  for (const reprobe of [
    { path: '/r/.git/hooks/pre-push', exists: false, executable: false },
    { path: '/r/.githooks/pre-push', exists: true, executable: false },
    null,
  ]) {
    const v = verdictAfterArming({ action: 'run_installer', installer: 'scripts/install-hooks.sh' }, reprobe);
    assert.equal(v.armed, false);
    assert.match(v.message, /could not|not armed|no pre-push/i, 'silence here rebuilds the exact bug');
  }
});

// ── end to end, against real git repos ────────────────────────────────────

test('E2E: arms a repo that ships a tracked .githooks/pre-push', () => {
  const dir = trackedHooks(scratchRepo());
  assert.equal(effectiveHookArmed(dir), false, 'precondition: not armed');
  const out = run(dir);
  assert.equal(hooksPathOf(dir), '.githooks');
  assert.equal(effectiveHookArmed(dir), true, 'the re-probe must be able to confirm a real arming');
  assert.match(out, /\.githooks/);
});

test('E2E: a non-executable tracked hook is made executable and confirmed', () => {
  const dir = trackedHooks(scratchRepo(), { executable: false });
  run(dir);
  assert.equal(effectiveHookArmed(dir), true);
});

test('E2E: `githooks` (no dot) is recognised too', () => {
  const dir = trackedHooks(scratchRepo(), { name: 'githooks' });
  run(dir);
  assert.equal(hooksPathOf(dir), 'githooks');
  assert.equal(effectiveHookArmed(dir), true);
});

test('E2E: runs a repo-authored installer and confirms by re-probe', () => {
  const dir = installer(scratchRepo(), [
    '#!/bin/sh',
    'set -e',
    'mkdir -p .githooks',
    'printf "#!/bin/sh\\nexit 0\\n" > .githooks/pre-push',
    'chmod +x .githooks/pre-push',
    'git config core.hooksPath .githooks',
  ].join('\n'));
  const out = run(dir);
  assert.equal(effectiveHookArmed(dir), true);
  assert.match(out, /install-hooks\.sh/);
});

test('E2E: an installer that exits 0 and installs NOTHING must WARN, not claim success', () => {
  const dir = installer(scratchRepo(), '#!/bin/sh\nexit 0\n');
  const out = run(dir);
  assert.equal(effectiveHookArmed(dir), false);
  assert.doesNotMatch(out, /armed/i, "the installer's exit code is not the verdict");
  assert.match(out, /could not|not armed|no pre-push/i);
});

test('E2E: does NOT override an explicit core.hooksPath pointing somewhere else', () => {
  const dir = trackedHooks(scratchRepo());
  const foreign = mkdtempSync(join(tmpdir(), 'foreignhooks-'));
  execFileSync('git', ['config', 'core.hooksPath', foreign], { cwd: dir });
  const out = run(dir);
  assert.equal(hooksPathOf(dir), foreign, 'a deliberate operator pointer is not ours to rewrite');
  assert.equal(out.trim(), '', 'and there is nothing to report about it');
});

test('E2E: an already-armed repo is left completely alone', () => {
  const dir = trackedHooks(scratchRepo());
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: dir });
  const before = readFileSync(join(dir, '.git', 'config'), 'utf8');
  const out = run(dir);
  assert.equal(readFileSync(join(dir, '.git', 'config'), 'utf8'), before, 'no config churn');
  assert.equal(out.trim(), '');
});

test('E2E: warns when the repo MANDATES a pre-push gate and none could be armed', () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, 'CLAUDE.md'), '## Gates\nBefore every `git push`: the pre-push gate must be green.\n');
  const out = run(dir);
  assert.match(out, /pre-push/i);
  assert.match(out, /\.githooks/, 'must name every path it looked for');
  assert.match(out, /install-hooks\.sh/);
});

test('E2E: AGENTS.md counts as a declaration too', () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, 'AGENTS.md'), 'Run the pre-push hook before pushing.\n');
  assert.match(run(dir), /pre-push/i);
});

test('E2E: a repo that declares nothing gets total silence', () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, 'CLAUDE.md'), 'This project has no gates of any kind.\n');
  assert.equal(run(dir).trim(), '');
});

test('E2E: NEVER synthesizes a pre-push hook out of thin air', () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, 'CLAUDE.md'), 'Before every `git push`: run the pre-push gate.\n');
  run(dir);
  assert.equal(existsSync(join(dir, '.git', 'hooks', 'pre-push')), false, 'no invented hook');
  assert.equal(existsSync(join(dir, '.githooks')), false, 'no invented hooks directory');
  assert.equal(hooksPathOf(dir), null, 'no pointer at a hook that does not exist');
});

test('E2E: kill switch stops arming a repo that could otherwise be armed', () => {
  const dir = trackedHooks(scratchRepo());
  const out = run(dir, { MOTHY_ARM_PUSH_GATE: '0' });
  assert.equal(hooksPathOf(dir), null, 'the switch must actually prevent the config write');
  assert.equal(out.trim(), '');
});

test('E2E: exits 0 and says nothing outside a git repository', () => {
  const dir = mkdtempSync(join(tmpdir(), 'armgate-bare-'));
  assert.equal(run(dir).trim(), '');
});

test('E2E: refuses to arm the plugin\'s own checkout', () => {
  // Mirrors precompact-snapshot.sh / auto-park.mjs: CLAUDE_PROJECT_DIR can point
  // at the plugin's installation, and touching git config there is not the job.
  const dir = trackedHooks(scratchRepo());
  const res = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ cwd: dir, hook_event_name: 'SessionStart' }),
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: dir, CLAUDE_PLUGIN_ROOT: dir, PWD: dir },
    cwd: tmpdir(),
  });
  assert.equal(res.status, 0);
  assert.equal(hooksPathOf(dir), null, 'must not configure the plugin checkout it is installed into');
});

// ── source-level guards ───────────────────────────────────────────────────

test('SOURCE: the hook carries no file-writing primitive at all', () => {
  // The single most important rule in this feature: only ever arm what the repo
  // AUTHORED. A synthesized hook with a guessed test command blocks every push
  // in that repo with a confusing error. Deleting this test would let a future
  // "helpful" default slip in unnoticed.
  const src = readFileSync(SCRIPT, 'utf8').replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  for (const forbidden of [
    'writeFileSync', 'appendFileSync', 'copyFileSync', 'symlinkSync', 'linkSync',
    'createWriteStream', 'writeFile', 'mkdirSync', 'rmSync', 'unlinkSync',
  ]) {
    assert.ok(!src.includes(forbidden), `must not be able to author a hook file (${forbidden})`);
  }
});

test('SOURCE: the effective-hook probe resolves core.hooksPath', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  assert.match(src, /--git-path/, 'the only probe that resolves core.hooksPath');
  const code = src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/['"`]\.git\/hooks\/pre-push['"`]/.test(code),
    'probing .git/hooks/pre-push directly is a FALSE NEGATIVE in a core.hooksPath repo');
});

// ── wiring ────────────────────────────────────────────────────────────────

test('WIRING: SessionStart is declared, identically, in BOTH wiring locations', () => {
  const { fromFile, fromPlugin } = readBothHookEventMaps();
  assert.deepEqual(fromFile, fromPlugin,
    'the two event maps must stay in sync — we do not know which location a given Claude Code version reads');
  for (const src of [fromFile, fromPlugin]) {
    assert.ok(src.SessionStart, 'SessionStart must be declared');
    const s = JSON.stringify(src.SessionStart);
    assert.match(s, /arm-push-gate\.mjs/);
    assert.match(s, /CLAUDE_PLUGIN_ROOT/, 'must resolve via CLAUDE_PLUGIN_ROOT, not a relative path');
    assert.match(s, /\|\| true/, 'must be fail-open at the wiring level');
  }
});

test('WIRING: the repo documents the hook, its kill switch, and the probe trap', () => {
  const claudeMd = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
  assert.match(claudeMd, /arm-push-gate/, 'an undocumented security control is one nobody maintains');
  assert.match(claudeMd, /MOTHY_ARM_PUSH_GATE/, 'the kill switch must be discoverable');
  assert.match(claudeMd, /--git-path/, 'the .git/hooks false-negative trap must be written down');
});

test('WIRING: this repo practises what it ships — it tracks its own pre-push gate', () => {
  // Otherwise the hook would warn, truthfully, on every session in its own
  // home repo: CLAUDE.md mandates a pre-push gate and none would exist.
  const hook = join(ROOT, '.githooks', 'pre-push');
  assert.ok(existsSync(hook), 'the repo that ships the arming hook must ship a gate to arm');
  // Reporter flags are allowed to differ from CI's (the hook uses `dot` so its
  // output does not flood an agent session's context); WHICH tests run may not.
  assert.match(readFileSync(hook, 'utf8'), /node --test (--[^\s]+ )*tests\//,
    'the gate must run the same portable test set CI runs');
  assert.equal(spawnSync('test', ['-x', hook]).status, 0, 'git skips a non-executable hook silently');
});

test('HOT PATH: an already-armed repo costs exactly ONE git call', () => {
  // This runs at every session start in every repo, and git is not free —
  // 4 spawns measured ~800ms in a large repo. The bound is asserted rather
  // than assumed, because a future field added to the cheap observation would
  // slow every session with nothing to say so.
  const dir = trackedHooks(scratchRepo());
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: dir });

  const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const bin = join(dir, 'shim');
  mkdirSync(bin, { recursive: true });
  const log = join(dir, 'git-calls.log');
  writeFileSync(join(bin, 'git'), `#!/bin/sh\necho "$@" >> ${JSON.stringify(log)}\nexec ${realGit} "$@"\n`);
  chmodSync(join(bin, 'git'), 0o755);

  const res = spawnSync(process.execPath, [SCRIPT], {
    input: '{}', encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CLAUDE_PROJECT_DIR: dir },
  });
  assert.equal(res.status, 0);
  const calls = readFileSync(log, 'utf8').trim().split('\n');
  assert.equal(calls.length, 1, `expected one git call, got:\n${calls.join('\n')}`);
  assert.match(calls[0], /rev-parse/, 'and it must be the combined probe');
});
