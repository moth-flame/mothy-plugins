// pre-push-secret-scan.test.mjs — MUTATION DRILL for the pre-push secret gate.
//
// The gate exists because an admin push bypasses branch protection, so the
// PUBLIC repo's gitleaks scan never ran on three pushes (2026-09-07). A hook
// that merely EXISTS proves nothing: the failure being guarded against is a
// scan that logs like coverage while checking nothing. So this file drives the
// REAL hook, as a real process, against real temp repos, and asserts:
//
//   D1  it invokes the SAME gitleaks command CI runs (source pin, anti-drift)
//   D2  it carries no bypass — no `|| true`, no exit 0 on a missing scanner
//   D3  gitleaks ABSENT  -> non-zero, "cannot scan"   (BEHAVIOR, no gitleaks needed)
//   D4  config ABSENT    -> non-zero, refuses to downgrade
//   D5  planted secret   -> non-zero, BLOCKED         (needs gitleaks)
//   D6  clean tree       -> zero                      (needs gitleaks)
//   D7  install-hooks.sh wires core.hooksPath at the tracked dir
//
// D3/D4 are the ones that run everywhere, including a CI runner with no
// gitleaks — so this file is never wholly inert. D5/D6 SKIP loudly rather than
// pass when gitleaks is absent; a skip is visible in `# skipped N`, a silent
// pass is not.
//
// The planted secret is assembled at runtime from two fragments so the literal
// never appears in this file — otherwise this test would trip the repo's own
// scan. It is obviously fake and matches no real system.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOK = join(REPO, '.githooks', 'pre-push');
const HOOK_SRC = readFileSync(HOOK, 'utf8');

// Assembled so the literal is absent from this file's own bytes.
const FAKE_SECRET = 'oct_' + 'fake_token_for_pre_push_hook_drill_not_real';

const HAVE_GITLEAKS = spawnSync('gitleaks', ['version'], { encoding: 'utf8' }).status === 0;

/** Strip comment lines — a source pin must assert the CODE, never the prose explaining it. */
function code(src) {
  return src.split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
}

/** A throwaway git repo carrying a copy of the real hook + the real config. */
function makeRepo({ withConfig = true, secret = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'prepush-drill-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'drill@example.invalid');
  git('config', 'user.name', 'drill');

  mkdirSync(join(dir, '.githooks'), { recursive: true });
  copyFileSync(HOOK, join(dir, '.githooks', 'pre-push'));
  chmodSync(join(dir, '.githooks', 'pre-push'), 0o755);
  if (withConfig) copyFileSync(join(REPO, '.gitleaks.toml'), join(dir, '.gitleaks.toml'));

  // Leg 2 must be able to pass, so leg 1 is what the assertion is about.
  mkdirSync(join(dir, 'tests'), { recursive: true });
  writeFileSync(
    join(dir, 'tests', 'ok.test.mjs'),
    "import { test } from 'node:test';\ntest('ok', () => {});\n",
  );

  writeFileSync(join(dir, 'README.md'), '# drill\n');
  if (secret) writeFileSync(join(dir, 'config.env'), `API_TOKEN=${secret}\n`);

  git('add', '-A');
  git('commit', '-q', '-m', 'drill');
  return dir;
}

/** Run the hook exactly as git would: as a process, in the repo, on its own PATH. */
function runHook(dir, { path = process.env.PATH } = {}) {
  const r = spawnSync('bash', [join(dir, '.githooks', 'pre-push')], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, PATH: path },
  });
  return { status: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}

// ── D1 — no drift from CI ──────────────────────────────────────────────────

test('D1 hook runs the SAME gitleaks command secret-scan.yml runs', () => {
  const ci = readFileSync(join(REPO, '.github', 'workflows', 'secret-scan.yml'), 'utf8');
  const FLAGS = 'detect --config .gitleaks.toml --no-banner --redact --exit-code 1';
  assert.ok(ci.includes(FLAGS), 'CI no longer runs this flag set — re-derive the hook from CI');
  // Pinned on the INVOCATION form, not merely on the flag string appearing
  // somewhere: the hook also ECHOES the command, and an earlier spelling of
  // this assertion was satisfied by that echo alone — i.e. it stayed green with
  // the real call deleted. Found by mutation, not by review.
  assert.ok(
    new RegExp(`if ! gitleaks ${FLAGS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(code(HOOK_SRC)),
    'pre-push must INVOKE the CI flag set verbatim, not a second drifting scan',
  );
});

// ── D2 — no bypass ─────────────────────────────────────────────────────────

test('D2 hook carries no bypass on the scan leg', () => {
  const src = code(HOOK_SRC);
  assert.ok(!/gitleaks[^\n]*\|\|\s*true/.test(src), 'gitleaks result must never be swallowed with || true');
  assert.ok(!/gitleaks[^\n]*;\s*exit\s+0/.test(src), 'gitleaks must never be followed by an unconditional exit 0');
  // The hook's own warning TEXT names --no-verify (to forbid it), so the pin is
  // on an INVOCATION, never on the string. An earlier, broader spelling of this
  // assertion failed on the warning itself.
  assert.ok(!/\bgit\b[^\n]*--no-verify/.test(src), 'the hook must not invoke git with --no-verify');
  // The missing-scanner branch must EXIT NON-ZERO. Pinned structurally: the
  // `command -v gitleaks` guard and an `exit 1` inside its block.
  const guard = src.match(/if ! command -v gitleaks[\s\S]*?\nfi\n/);
  assert.ok(guard, 'missing-gitleaks guard not found');
  assert.ok(/exit 1/.test(guard[0]), 'a missing scanner must exit non-zero, never 0');
});

// ── D3 — an unrunnable scanner FAILS LOUD (runs everywhere) ────────────────

test('D3 gitleaks absent from PATH -> push BLOCKED, says "cannot scan"', () => {
  const dir = makeRepo();
  try {
    // /usr/bin:/bin has git but not gitleaks (Homebrew installs to /usr/local/bin).
    const r = runHook(dir, { path: '/usr/bin:/bin' });
    assert.notEqual(r.status, 0, 'a hook that cannot scan must not exit 0');
    assert.match(r.out, /cannot scan/i);
    assert.match(r.out, /gitleaks is not installed/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── D4 — a missing config is a refusal, not a silent downgrade ─────────────

test('D4 .gitleaks.toml absent -> push BLOCKED rather than scanned with defaults', { skip: !HAVE_GITLEAKS ? 'gitleaks not installed' : false }, () => {
  const dir = makeRepo({ withConfig: false });
  try {
    const r = runHook(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.out, /\.gitleaks\.toml is missing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── D5 / D6 — the drill proper ─────────────────────────────────────────────

test('D5 planted secret in a committed file -> push BLOCKED', { skip: !HAVE_GITLEAKS ? 'gitleaks not installed — D5 NOT run; the planted-secret drill did not execute' : false }, () => {
  const dir = makeRepo({ secret: FAKE_SECRET });
  try {
    const r = runHook(dir);
    assert.notEqual(r.status, 0, 'a committed secret must block the push');
    assert.match(r.out, /BLOCKED/);
    // Redacted output: the finding is reported, the value is not echoed.
    assert.ok(!r.out.includes(FAKE_SECRET), '--redact must keep the value out of the hook output');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('D6 clean tree -> push allowed', { skip: !HAVE_GITLEAKS ? 'gitleaks not installed — D6 NOT run' : false }, () => {
  const dir = makeRepo();
  try {
    const r = runHook(dir);
    assert.equal(r.status, 0, `clean tree must pass; got:\n${r.out}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── D7 — the installer actually wires the pointer ──────────────────────────

test('D7 install-hooks.sh points core.hooksPath at the tracked dir', () => {
  const dir = makeRepo();
  try {
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    copyFileSync(join(REPO, 'scripts', 'install-hooks.sh'), join(dir, 'scripts', 'install-hooks.sh'));
    const r = spawnSync('bash', ['scripts/install-hooks.sh'], { cwd: dir, encoding: 'utf8' });
    const got = execFileSync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: dir, encoding: 'utf8' }).trim();
    assert.equal(got, '.githooks', `installer output:\n${r.stdout}${r.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
