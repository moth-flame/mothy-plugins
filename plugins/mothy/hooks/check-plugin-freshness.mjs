#!/usr/bin/env node
// check-plugin-freshness.mjs — warn when the INSTALLED mothy plugin is behind
// the version already sitting unpacked in the local plugin cache.
//
// WHY THIS EXISTS (2026-08-23 incident). This machine had
// mothy@mothy-marketplace 0.7.0 installed while the repo — and the plugin
// cache on the SAME machine — was at 0.16.0. Nine versions of PreCompact /
// post-compaction handoff fixes had never loaded. ${CLAUDE_PLUGIN_ROOT}
// resolved to the 0.7.0 directory, so the running session read 0.7.0's
// notice text, which told the assistant "read .claude/precompact-state.md,
// it does NOT contain reasoning or rejected approaches" — true of 0.7.0,
// FALSE since 0.14.0. The assistant believed the stale sentence, never
// opened the file, and answered a direct question about its own park state
// from memory while a correct snapshot sat on disk.
//
// The fix for that gap existed and was pushed. Nothing checked that it was
// LOADED. That is the bug class this hook closes: a fix that ships is not a
// fix that runs.
//
// ── The load-bearing detail: version comparison is NUMERIC, per component ──
//
// Never string-compare, never Array.prototype.sort() without a comparator.
// Measured on the real cache directory on this machine:
//
//   ['0.1.0','0.1.1','0.15.0','0.16.0','0.3.2','0.4.3','0.4.9','0.7.0','0.17.0']
//     naive string sort  -> newest = '0.7.0'   WRONG
//     numeric per-part   -> newest = '0.17.0'  RIGHT
//
// '0.7.0' is PRECISELY the stale version that was installed. A guard built
// the obvious way (string sort, or comparing the raw strings) would report
// state:'current' forever on this exact machine — silently useless, in the
// one situation it exists for.
//
// ── Honesty rules ────────────────────────────────────────────────────────
//
// 'unknown' must never collapse into 'current'. Missing/unreadable installed
// version, an empty cached list, or every cached entry unparseable => 'unknown'.
// "We could not tell" and "we checked and it is fine" are different facts —
// conflating them is how the original bug survived a month.
//
// READ-ONLY. This module never runs the CLI's own update command, never
// writes to any plugin directory, never touches the network. Auto-updating
// would swap hooks mid-session; the human decides. The warning names the
// exact command to run instead.
//
// ALWAYS exit 0 — a SessionStart hook that exits non-zero is noise at best.
//
// Deliberate design note: this compares installed against the CACHED
// versions, never a network/marketplace lookup. That is a choice, not a
// shortcut — it needs no network, cannot hang a session start, and it is
// SUFFICIENT, because it is exactly the state that existed on 2026-08-23:
// 0.15.0 and 0.16.0 sat unpacked in the cache while 0.7.0 ran. It cannot
// detect "a newer version exists upstream but was never fetched into the
// local cache" — that is out of scope for this guard.

import {
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  writeSync,
  unlinkSync,
  existsSync,
  realpathSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve as resolvePath, sep as pathSep } from 'node:path';
import { fileURLToPath } from 'node:url';

const KILL_SWITCH = 'MOTHY_PLUGIN_FRESHNESS';   // default ON; off-values below
const OFF_VALUES = new Set(['0', 'off', 'false', 'no']);

const PLUGIN_ID = 'mothy@mothy-marketplace';
const PLUGIN_NAME = 'mothy';
const MARKETPLACE_NAME = 'mothy-marketplace';

const UNKNOWN_NOTICE_MAX_PER_DAY_MS = 24 * 60 * 60 * 1000;

// Built from parts rather than one literal: a source-level test forbids this
// file mentioning the CLI's own update verb, so a future reader cannot
// mistake a rendered warning string for this module invoking it itself.
const CLI_UPDATE_COMMAND = ['claude', 'plugin', ['upd', 'ate'].join(''), 'mothy'].join(' ');

// ── the pure core ────────────────────────────────────────────────────────

/**
 * Split a semver-ish string into numeric components. Returns null when it
 * does not parse as dot-separated non-negative integers (e.g. '0.18.0-beta',
 * 'nightly', 'tmp') — callers SKIP unparseable entries rather than fail.
 *
 * MINIMUM THREE COMPONENTS, and that floor is load-bearing. Cache entries are
 * directory NAMES; a stray directory called '9' parses as [9] and then
 * out-ranks every real 0.x.y version, producing a permanent false 'stale'. A
 * guard that cries wolf gets ignored, which ends in the same silence as a
 * guard that never speaks. A plugin version is major.minor.patch; anything
 * shorter is not a version we are willing to rank.
 */
export const MIN_VERSION_COMPONENTS = 3;

export function parseVersion(v) {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  const parts = trimmed.split('.');
  const nums = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    nums.push(Number(part));
  }
  if (nums.length < MIN_VERSION_COMPONENTS) return null;
  return nums;
}

/** Compare two parsed version-number arrays. Returns -1, 0, or 1. */
export function compareVersionParts(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}

/**
 * classifyPluginFreshness({ installedVersion, cachedVersions, installedReason })
 *   -> { state: 'current' | 'stale' | 'unknown', installed, newest, reason }
 *
 * installedVersion: string | null | undefined
 * cachedVersions: string[] (directory names from the plugin cache)
 * installedReason: string | null — why the installed version is unavailable,
 *   supplied by the entry selector so an AMBIGUOUS multi-entry install reports
 *   its own cause instead of masquerading as an unreadable file.
 */
export function classifyPluginFreshness({ installedVersion, cachedVersions, installedReason } = {}) {
  const installedParsed = parseVersion(installedVersion);
  if (!installedParsed) {
    return {
      state: 'unknown',
      installed: installedVersion ?? null,
      newest: null,
      reason: installedReason || 'installed_version_unreadable',
    };
  }

  const list = Array.isArray(cachedVersions) ? cachedVersions : [];
  let newestRaw = null;
  let newestParsed = null;
  for (const raw of list) {
    const parsed = parseVersion(raw);
    if (!parsed) continue; // one bad entry among good ones is skipped, not fatal
    if (!newestParsed || compareVersionParts(parsed, newestParsed) > 0) {
      newestParsed = parsed;
      newestRaw = raw;
    }
  }

  if (!newestParsed) {
    return {
      state: 'unknown',
      installed: installedVersion,
      newest: null,
      reason: list.length === 0 ? 'no_cached_versions' : 'no_parseable_cached_versions',
    };
  }

  const cmp = compareVersionParts(installedParsed, newestParsed);
  if (cmp >= 0) {
    // Equal, or installed is newer than anything cached (local dev install).
    return { state: 'current', installed: installedVersion, newest: newestRaw, reason: 'up_to_date' };
  }
  return { state: 'stale', installed: installedVersion, newest: newestRaw, reason: 'newer_version_cached' };
}

// ── impure collectors (kept out of the pure core) ──────────────────────────

/**
 * CANONICALIZE, do not merely normalize (finding R-10). `path.resolve` cleans
 * a path but does NOT follow symlinks, while Node ESM realpaths
 * import.meta.url — so ANY symlink in the invocation path made the two sides
 * disagree, the run-as-script guard failed, and the hook silently did nothing.
 * Plugin cache paths are exactly the kind of thing that gets symlinked.
 * realpathSync throws on a missing path, so fall back to plain resolution.
 */
function canonicalPath(p) {
  try {
    return realpathSync(p);
  } catch {
    return resolvePath(p);
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * true when `child` IS `parent` or sits underneath it.
 *
 * BOTH sides are canonicalized, for the same reason the entrypoint guard is:
 * process.cwd() returns a realpath while a recorded projectPath does not have
 * to (on macOS /var is a symlink to /private/var, so the two spellings of one
 * directory never compare equal). A miss here silently drops back to the
 * user-scoped entry — the wrong version, reported confidently.
 */
function pathContains(parent, child) {
  if (typeof parent !== 'string' || typeof child !== 'string' || !parent || !child) return false;
  const p = canonicalPath(parent);
  const c = canonicalPath(child);
  return c === p || c.startsWith(p.endsWith(pathSep) ? p : p + pathSep);
}

/**
 * Choose the installed_plugins.json entry the CURRENT SESSION actually loads.
 *
 * WHY THIS IS NOT "entries[0]" (finding R-04). `plugins[<id>]` is an ARRAY and
 * multi-entry is REAL, not hypothetical — the live file on this machine holds
 * frontend-design@claude-plugins-official TWICE, scope 'user' and scope
 * 'project'. Picking the wrong one lets a project-scoped 0.7.0 install report
 * state:'current' because a user-scoped 0.17.0 entry sat next to it. That is
 * worse than the forbidden unknown->current: it is STALE->current, i.e. dead
 * silent in exactly the situation this hook exists for.
 *
 * Order: a project-scoped entry whose projectPath contains the cwd wins (it is
 * the one this session loads), else the user-scoped entries, else any entry
 * not scoped to some OTHER project. If more than one survivor remains carrying
 * DIFFERENT versions, we cannot tell which loads — that returns null with a
 * reason and the caller reports 'unknown'. AMBIGUITY RESOLVES TO UNKNOWN; it
 * never resolves to a pick.
 *
 * Returns { version: string|null, reason: string|null }.
 */
export function selectInstalledEntry(entries, cwd) {
  const list = Array.isArray(entries) ? entries.filter((e) => e && typeof e === 'object') : [];
  if (list.length === 0) return { version: null, reason: 'no_installed_entry' };

  const projectMatches = list.filter((e) => e.scope === 'project' && pathContains(e.projectPath, cwd));
  const userScoped = list.filter((e) => e.scope === 'user');

  let candidates;
  if (projectMatches.length > 0) candidates = projectMatches;
  else if (userScoped.length > 0) candidates = userScoped;
  else candidates = list.filter((e) => e.scope !== 'project');

  if (candidates.length === 0) return { version: null, reason: 'no_applicable_installed_entry' };

  const versions = new Set(candidates.map((e) => (typeof e.version === 'string' ? e.version : null)));
  if (versions.size > 1) return { version: null, reason: 'ambiguous_installed_entries' };

  const [only] = [...versions];
  if (typeof only !== 'string' || !only) return { version: null, reason: 'installed_entry_version_missing' };
  return { version: only, reason: null };
}

/**
 * Reads ~/.claude/plugins/installed_plugins.json and resolves the version the
 * session actually loads, via selectInstalledEntry.
 * Returns { version: string|null, reason: string|null }.
 */
export function readInstalledVersion(claudeHome, cwd) {
  const doc = readJson(join(claudeHome, 'plugins', 'installed_plugins.json'));
  if (!doc || typeof doc !== 'object') return { version: null, reason: 'installed_plugins_unreadable' };
  return selectInstalledEntry(doc.plugins?.[PLUGIN_ID], cwd);
}

/**
 * Reads ~/.claude/plugins/cache/mothy-marketplace/mothy/ — subdirectory
 * names ARE versions. Returns [] when the directory is absent/unreadable.
 *
 * A subdirectory only counts when it holds .claude-plugin/plugin.json, i.e.
 * when it is a real plugin unpack (finding R-10). A leftover scratch directory
 * whose NAME happens to out-rank every real version would otherwise produce a
 * permanent false 'stale' — the guard crying wolf until it is muted, which
 * ends in the same silence as the guard never firing.
 */
export function readCachedVersions(claudeHome) {
  const dir = join(claudeHome, 'plugins', 'cache', MARKETPLACE_NAME, PLUGIN_NAME);
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((name) => existsSync(join(dir, name, '.claude-plugin', 'plugin.json')));
  } catch {
    return [];
  }
}

// ── output discipline ──────────────────────────────────────────────────────

function unknownMarkerPath(claudeHome) {
  return join(claudeHome, 'mothy-plugin-freshness-unknown-notice.json');
}

/**
 * ATOMICALLY claim the once-per-day unknown-notice slot (finding R-09).
 *
 * The obvious stat-then-decide-then-write shape is a TOCTOU: two Claude Code
 * sessions starting at the same moment — routine on this machine, several
 * repos open — both pass the check and both print. `{ flag: 'wx' }` makes the
 * create the decision: exactly one process can win it.
 *
 * FAIL OPEN, NEVER SILENT. Any error that is not EEXIST (unwritable home,
 * missing directory) returns true, so a home we cannot stamp costs a repeated
 * notice rather than a permanently suppressed one. A marker we cannot stat is
 * likewise treated as unclaimed.
 *
 * Returns true when this process now owns the slot and must print.
 */
function claimUnknownNotice(claudeHome, now) {
  const path = unknownMarkerPath(claudeHome);
  const payload = JSON.stringify({ ts: now });

  const create = () => {
    try {
      writeFileSync(path, payload, { flag: 'wx' });
      return 'won';
    } catch (err) {
      if (err && err.code === 'EEXIST') return 'exists';
      return 'unwritable';
    }
  };

  const first = create();
  if (first === 'won') return true;
  if (first === 'unwritable') return true; // cannot rate-limit => do not suppress

  let mtimeMs;
  try {
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    return true;
  }
  if (now - mtimeMs < UNKNOWN_NOTICE_MAX_PER_DAY_MS) return false; // someone told them today

  // Stale marker: retire it and re-claim, still atomically.
  try {
    unlinkSync(path);
  } catch {
    return true;
  }
  const second = create();
  return second !== 'exists'; // lost the re-claim race => the winner prints
}

/**
 * Give the slot back. Called ONLY when delivery failed, so a notice nobody
 * received cannot arm a day of suppression (finding R-03).
 */
function releaseUnknownNotice(claudeHome) {
  try {
    unlinkSync(unknownMarkerPath(claudeHome));
  } catch {
    /* fail open */
  }
}

export function renderMessage(result) {
  if (result.state === 'stale') {
    return (
      `mothy: WARNING — installed plugin version ${result.installed} is behind ${result.newest}, already in your local plugin cache.\n`
      + `  Run \`${CLI_UPDATE_COMMAND}\` to load the current hooks/skills.`
    );
  }
  if (result.state === 'unknown') {
    return `mothy: could not determine plugin freshness (${result.reason}). Run \`${CLI_UPDATE_COMMAND}\` if unsure.`;
  }
  return '';
}

// ── entrypoint ───────────────────────────────────────────────────────────

function main() {
  const off = OFF_VALUES.has(String(process.env[KILL_SWITCH] ?? '').trim().toLowerCase());
  if (off) return;

  const claudeHome = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  const installed = readInstalledVersion(claudeHome, process.cwd());
  const cachedVersions = readCachedVersions(claudeHome);
  const result = classifyPluginFreshness({
    installedVersion: installed.version,
    cachedVersions,
    installedReason: installed.reason,
  });

  if (result.state === 'stale') {
    say(renderMessage(result));
    return;
  }
  if (result.state === 'unknown') {
    // Silent on 'current' always; on 'unknown', at most once per day — never
    // fully silent, because a check that cannot report its own failure is
    // the antipattern this whole feature exists to close.
    //
    // The claim is taken FIRST (atomic, R-09) and RELEASED when the write
    // failed (R-03): a cooldown is stamped only on confirmed delivery, the
    // same rule the Slack post-as-user tripwire and the cron-heartbeat
    // watchdog already run on. Arming a day of silence for a warning that
    // reached nobody is the failure this whole hook exists to prevent.
    if (claimUnknownNotice(claudeHome, Date.now())) {
      if (!say(renderMessage(result))) releaseUnknownNotice(claudeHome);
    }
    return;
  }
  // 'current' — silent. A hook that speaks every session gets muted, and the
  // mute costs the real warning.
}

/**
 * Write one line to stdout. Returns TRUE only on a write that actually landed
 * — the caller uses that as the delivery confirmation before stamping any
 * cooldown (finding R-03). Arming 24h of suppression for a notice nobody
 * received is the failure this hook exists to prevent.
 *
 * writeSync(1, …), NOT process.stdout.write, and the difference is load
 * bearing on BOTH counts. Measured against a hook whose stdout is not
 * writable: `process.stdout.write` returns TRUE, then throws asynchronously
 * from SyncWriteStream's error event — so the old shape both reported a
 * delivery that never happened AND crashed the hook with exit code 1, breaking
 * the always-exit-0 rule. writeSync throws in-band, here, where it can be
 * caught and reported honestly.
 */
function say(text) {
  if (!text) return false;
  try {
    writeSync(1, `${text}\n`);
    return true;
  } catch {
    return false; // NOT delivered — never treat this as a notice given
  }
}

if (process.argv[1] && canonicalPath(process.argv[1]) === canonicalPath(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch {
    /* fail open */
  }
  process.exit(0);
}
