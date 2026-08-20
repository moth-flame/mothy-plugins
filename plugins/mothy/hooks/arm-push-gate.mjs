#!/usr/bin/env node
// arm-push-gate.mjs — arm the pre-push gate the repo ALREADY DECLARES.
//
// WHY THIS EXISTS. Git hooks are PER-CLONE, and neither way of delivering one
// survives a clone by itself:
//
//   - `.git/hooks/*` lives inside `.git` and is never cloned.
//   - `core.hooksPath` pointing at a TRACKED directory (`.githooks/`) makes the
//     hook FILES ride the checkout — but the POINTER is local git config, which
//     is also not cloned. A repo's own `scripts/install-hooks.sh` sets it, once,
//     on whichever machine happened to run it.
//
// So every fresh clone — and every cloud session — runs with no pre-push gate
// at all, SILENTLY. A money-moving repo was pushed that way; the only reason it
// was caught is that the session happened to look. This hook runs the one
// idempotent command that arms it, at session start, in whatever repo it finds.
//
// ── The rule that matters most ─────────────────────────────────────────────
//
// IT NEVER SYNTHESIZES A HOOK, AND NEVER GUESSES A TEST COMMAND. It only ever
// arms what the repo AUTHORED. A guessed command would block every push in that
// repo with a confusing error — strictly worse than the gap it was closing.
// This module carries no file-writing primitive at all, and a source-level test
// asserts that, so a future "helpful default" cannot slip in.
//
// ── The other half: the probe ──────────────────────────────────────────────
//
// Asking whether `.git/hooks/pre-push` exists is a FALSE NEGATIVE in a
// `core.hooksPath` repo, and it already produced a wrong conclusion once.
// Measured in the Mothy repo on 2026-08-20: `.git/hooks/pre-push` does NOT
// exist and the gate is fully armed, because `core.hooksPath` points at
// `.githooks/`. The only correct probe is
//
//     git rev-parse --git-path hooks/pre-push
//
// which resolves `core.hooksPath` and returns a path relative to the CWD it was
// run in (verified: `../../.githooks/pre-push` from two levels down).
//
// ── Failure posture ────────────────────────────────────────────────────────
//
// FAIL OPEN. Exits 0 on every path. A hook that can stop a session from
// starting is worse than no hook.
//
// SAYING NOTHING IS THE OLD BUG. The failure being fixed is not "no gate", it
// is "no gate, and nobody could tell". So when the repo's own docs mandate a
// pre-push gate and none can be armed, it says so out loud and names every path
// it looked in. When the repo declares nothing, it stays completely silent —
// unsolicited noise in every unrelated repo is how a real warning gets ignored.
//
// THE EXIT CODE IS NEVER THE VERDICT. After arming, the effective hook is
// RE-PROBED. An installer that exits 0 and installs nothing must warn, not
// report success. (Same doctrine as the dist-patch marker re-grep in the Mothy
// repo.)

import { readFileSync, statSync, accessSync, chmodSync, readdirSync, constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KILL_SWITCH = 'MOTHY_ARM_PUSH_GATE';       // default ON; off-values below
const OFF_VALUES = new Set(['0', 'off', 'false', 'no']);

// Tracked hooks directories, in preference order. Both spellings are in the
// wild; nothing else is guessed at.
const TRACKED_HOOK_DIRS = ['.githooks', 'githooks'];

// Repo-authored installers, in preference order.
const INSTALLERS = [
  'scripts/install-hooks.sh',
  'scripts/install-git-hooks.sh',
  'bin/install-hooks.sh',
  'install-hooks.sh',
];

// Where a repo states its own rules. If one of these mentions a pre-push gate
// and we could not arm one, that is worth interrupting for.
const GATE_DOCS = ['CLAUDE.md', 'AGENTS.md'];
const GATE_MENTION = /pre-?push/i;

// Verdicts reachable from the cheap observation alone — nothing further is
// consulted after any of them, so the expensive half is skipped entirely.
const EARLY_EXITS = new Set(['disabled', 'not_a_repo', 'already_armed']);

const GIT_TIMEOUT_MS = 5_000;
const INSTALLER_TIMEOUT_MS = 20_000;
const DOC_READ_LIMIT = 2 * 1024 * 1024;

// ── pure decision ──────────────────────────────────────────────────────────

/**
 * The whole decision table, as one pure function over injected observations.
 *
 * Returns `{ action, arm, reprobe, message, dir?, installer? }`.
 *   arm     — whether the caller should change anything at all
 *   reprobe — whether the result must be confirmed before being reported
 *   message — what to say NOW (empty string = say nothing)
 */
export function decideArming(obs = {}) {
  const off = OFF_VALUES.has(String(obs.killSwitch ?? '').trim().toLowerCase());
  if (off) return quiet('disabled');

  // 1. Not a git work tree. Nothing to arm, nothing to say.
  if (!obs.insideWorkTree) return quiet('not_a_repo');

  // 2. Already armed. An existing-but-not-executable hook does NOT count —
  //    git skips a non-executable hook silently, which is the failure mode
  //    this whole hook exists to make visible.
  const eff = obs.effectiveHook;
  if (eff && eff.exists && eff.executable) return quiet('already_armed');

  const trackedDirs = obs.trackedHooksDirs || [];

  // 3. An explicit core.hooksPath pointing somewhere that is NOT one of the
  //    repo's tracked hooks dirs is a deliberate operator choice — possibly a
  //    company-wide `--global` pointer. Not ours to override, and not
  //    interesting enough to report.
  if (obs.configuredHooksPath) {
    const target = obs.configuredHooksPathResolved || obs.configuredHooksPath;
    const isTracked = trackedDirs.some((d) => samePath(d.absolute, target));
    if (!isTracked) return quiet('respect_explicit_hooks_path');
  }

  // 4. The repo tracks a hooks dir containing a pre-push hook it authored.
  //    Point git at it. (Also the path that fixes a lost executable bit.)
  const candidate = trackedDirs.find((d) => d.prePushExists);
  if (candidate) {
    return { action: 'arm_hooks_path', arm: true, reprobe: true, dir: candidate.dir, message: '' };
  }

  // 5. The repo ships its own installer. Run it — then re-probe, because its
  //    exit code says nothing about whether a hook is now active.
  const installer = (obs.installers || [])[0];
  if (installer) {
    return { action: 'run_installer', arm: true, reprobe: true, installer, message: '' };
  }

  // 6. Nothing could be armed. If the repo MANDATES a gate, this is the
  //    load-bearing branch: a silent give-up here rebuilds the exact bug.
  if (obs.declaresGate) {
    const dirs = (obs.searchedHooksDirs || TRACKED_HOOK_DIRS).map((d) => `${d}/pre-push`).join(', ');
    const installers = (obs.searchedInstallers || INSTALLERS).join(', ');
    return {
      action: 'warn_no_gate',
      arm: false,
      reprobe: false,
      message:
        'mothy: WARNING — this repo\'s own docs require a pre-push gate, and none is active in this clone.\n'
        + `  looked for a tracked hooks dir: ${dirs}\n`
        + `  looked for an installer: ${installers}\n`
        + '  nothing will be checked before a push here. Nothing was invented on your behalf: a guessed\n'
        + '  gate command would block every push with a confusing error. Add the hook the repo intends,\n'
        + `  or set ${KILL_SWITCH}=0 to silence this.`,
    };
  }

  // The repo declares no gate. Silence.
  return quiet('silent_no_gate');
}

/**
 * The verdict, AFTER arming — read off a fresh probe, never off an exit code.
 *
 * An installer that exits 0 and installs nothing is the case this exists for.
 */
export function verdictAfterArming(decision = {}, reprobe = null) {
  const armed = Boolean(reprobe && reprobe.exists && reprobe.executable);
  const via = decision.action === 'run_installer'
    ? `${decision.installer}`
    : `core.hooksPath -> ${decision.dir}`;

  if (armed) {
    return {
      armed: true,
      message: `mothy: activated this repo's own pre-push gate (${via}) — ${reprobe.path}`,
    };
  }
  return {
    armed: false,
    message:
      `mothy: WARNING — could not activate a pre-push gate here (tried ${via}), and no pre-push hook is\n`
      + '  active afterwards. The attempt succeeding is not the same as the gate existing, so this is\n'
      + `  reported rather than assumed. Nothing will be checked before a push. Set ${KILL_SWITCH}=0 to silence.`,
  };
}

function quiet(action) {
  return { action, arm: false, reprobe: false, message: '' };
}

function samePath(a, b) {
  if (!a || !b) return false;
  const norm = (p) => resolve(String(p)).replace(/\/+$/, '');
  return norm(a) === norm(b);
}

// ── observation (impure, bounded: a few git calls and a few stats) ──────────

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: GIT_TIMEOUT_MS });
  return { ok: !r.error && r.status === 0, out: String(r.stdout || '') };
}

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}
function isFile(p) {
  try { return statSync(p).isFile(); } catch { return false; }
}
function isExec(p) {
  try { accessSync(p, constants.X_OK); return isFile(p); } catch { return false; }
}

/** The ONLY correct liveness probe for the pre-push hook. */
export function probeEffectiveHook(startDir) {
  const r = git(['rev-parse', '--git-path', 'hooks/pre-push'], startDir);
  if (!r.ok) return null;
  const rel = r.out.trim();
  if (!rel) return null;
  const path = resolve(startDir, rel);
  return { path, exists: isFile(path), executable: isExec(path) };
}

function declaresGate(root) {
  for (const name of GATE_DOCS) {
    const p = join(root, name);
    if (!isFile(p)) continue;
    try {
      if (statSync(p).size > DOC_READ_LIMIT) continue;
      if (GATE_MENTION.test(readFileSync(p, 'utf8'))) return true;
    } catch { /* unreadable doc is not a declaration */ }
  }
  return false;
}

/**
 * The cheap half: ONE git call, answering the only two questions that can end
 * the run early — are we in a work tree, and is a pre-push hook already live.
 *
 * This runs at every session start in every repo, and `git` is not free: 4
 * spawns measured ~800ms in a large repo (~200ms each). An already-armed repo —
 * the common case once this hook has done its job — must not pay for four.
 * `tests/arm-push-gate.test.mjs` counts the git invocations so this bound
 * cannot quietly rot.
 */
function observeFast(root, env) {
  const rev = git(['rev-parse', '--is-inside-work-tree', '--show-toplevel', '--git-path', 'hooks/pre-push'], root);
  const lines = rev.out.split('\n').map((s) => s.trim());
  const base = {
    killSwitch: env[KILL_SWITCH],
    searchedHooksDirs: TRACKED_HOOK_DIRS,
    searchedInstallers: INSTALLERS,
  };
  if (!rev.ok || lines[0] !== 'true' || !lines[1]) return { ...base, insideWorkTree: false };

  const hookPath = lines[2] ? resolve(root, lines[2]) : null;
  return {
    ...base,
    insideWorkTree: true,
    repoRoot: lines[1],
    effectiveHook: hookPath
      ? { path: hookPath, exists: isFile(hookPath), executable: isExec(hookPath) }
      : null,
  };
}

/**
 * The rest — only reached when the fast half could not end the run. Every field
 * here is consulted strictly AFTER `already_armed` in the decision table, which
 * is why leaving them off the fast observation cannot change a verdict.
 */
function observeRest(repoRoot) {
  const cfg = git(['config', '--get', 'core.hooksPath'], repoRoot);
  const configuredHooksPath = cfg.ok && cfg.out.trim() ? cfg.out.trim() : null;

  const trackedHooksDirs = [];
  for (const dir of TRACKED_HOOK_DIRS) {
    const absolute = join(repoRoot, dir);
    if (!isDir(absolute)) continue;
    const prePush = join(absolute, 'pre-push');
    trackedHooksDirs.push({
      dir,
      absolute,
      prePushExists: isFile(prePush),
      prePushExecutable: isExec(prePush),
    });
  }

  return {
    configuredHooksPath,
    configuredHooksPathResolved: configuredHooksPath ? resolve(repoRoot, configuredHooksPath) : null,
    trackedHooksDirs,
    installers: INSTALLERS.filter((rel) => isFile(join(repoRoot, rel))),
    declaresGate: declaresGate(repoRoot),
    searchedHooksDirs: TRACKED_HOOK_DIRS,
    searchedInstallers: INSTALLERS,
  };
}

// ── acting ─────────────────────────────────────────────────────────────────

/**
 * Restore the executable bit on hooks the repo already authored.
 *
 * git preserves the bit, but a checkout on some filesystems (and every
 * zip/tarball hand-off) loses it — and git then skips the hook SILENTLY. This
 * only ever changes the MODE of an existing file; it cannot create one.
 */
function makeExecutable(dirAbs) {
  let names = [];
  try { names = readdirSync(dirAbs); } catch { return; }
  for (const name of names) {
    const p = join(dirAbs, name);
    if (!isFile(p)) continue;
    try { chmodSync(p, (statSync(p).mode & 0o7777) | 0o111); } catch { /* fail open */ }
  }
}

function act(decision, obs, root) {
  if (decision.action === 'arm_hooks_path') {
    makeExecutable(join(obs.repoRoot, decision.dir));
    // The relative dir name, matching what a repo's own install-hooks.sh
    // writes, so the two agree and stay mutually idempotent. Verified: git
    // resolves a relative core.hooksPath against the work-tree root, so the
    // hook still fires from a subdirectory.
    git(['config', 'core.hooksPath', decision.dir], obs.repoRoot);
  } else if (decision.action === 'run_installer') {
    spawnSync('bash', [join(obs.repoRoot, decision.installer)], {
      cwd: obs.repoRoot,
      timeout: INSTALLER_TIMEOUT_MS,
      stdio: 'ignore',   // its chatter must never land in the session's context
    });
  }
  return decision.reprobe ? probeEffectiveHook(root) : null;
}

// ── entrypoint ─────────────────────────────────────────────────────────────

function main() {
  let hook = {};
  try { hook = JSON.parse(readStdin() || '{}'); } catch { hook = {}; }

  // Same ordering and the same refusal as the PreCompact hooks: never operate
  // on our own installation. CLAUDE_PROJECT_DIR can point at the plugin's
  // checkout, and rewriting git config there is not the job.
  let root = process.env.CLAUDE_PROJECT_DIR || hook.cwd || process.cwd();
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (pluginRoot && resolve(root).startsWith(resolve(pluginRoot))) root = process.cwd();

  // Cheap first. If the run can end on one git call, it does — see observeFast.
  const fast = observeFast(root, process.env);
  const early = decideArming(fast);
  if (EARLY_EXITS.has(early.action)) {
    say(early.message);   // empty for all three today; not assumed to stay that way
    return;
  }

  const obs = { ...fast, ...observeRest(fast.repoRoot) };
  const decision = decideArming(obs);

  if (!decision.arm) {
    if (decision.message) say(decision.message);
    return;
  }

  const reprobe = act(decision, obs, root);
  say(verdictAfterArming(decision, reprobe).message);
}

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}
function say(text) {
  if (!text) return;
  try { process.stdout.write(`${text}\n`); } catch { /* fail open */ }
}

// The pure helpers above are imported by tests; running a session hook on
// import would be its own kind of surprise.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try { main(); } catch { /* fail open */ }
  process.exit(0);
}
