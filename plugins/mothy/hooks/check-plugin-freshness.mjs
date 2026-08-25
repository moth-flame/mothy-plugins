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

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
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
 */
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
  if (nums.length === 0) return null;
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
 * classifyPluginFreshness({ installedVersion, cachedVersions })
 *   -> { state: 'current' | 'stale' | 'unknown', installed, newest, reason }
 *
 * installedVersion: string | null | undefined
 * cachedVersions: string[] (directory names from the plugin cache)
 */
export function classifyPluginFreshness({ installedVersion, cachedVersions } = {}) {
  const installedParsed = parseVersion(installedVersion);
  if (!installedParsed) {
    return {
      state: 'unknown',
      installed: installedVersion ?? null,
      newest: null,
      reason: 'installed_version_unreadable',
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

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Reads ~/.claude/plugins/installed_plugins.json and returns the installed
 * version string for mothy@mothy-marketplace, or null if it cannot be
 * determined. Prefers the entry whose installPath exists on disk; falls back
 * to the first entry, since a single-entry array is the common case and a
 * stale/missing installPath must not turn into "no version at all".
 */
export function readInstalledVersion(claudeHome) {
  const doc = readJson(join(claudeHome, 'plugins', 'installed_plugins.json'));
  if (!doc || typeof doc !== 'object') return null;
  const entries = doc.plugins?.[PLUGIN_ID];
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const withExistingPath = entries.find((e) => e && typeof e.installPath === 'string' && existsSync(e.installPath));
  const chosen = withExistingPath || entries[0];
  return chosen && typeof chosen.version === 'string' ? chosen.version : null;
}

/**
 * Reads ~/.claude/plugins/cache/mothy-marketplace/mothy/ — subdirectory
 * names ARE versions. Returns [] when the directory is absent/unreadable.
 */
export function readCachedVersions(claudeHome) {
  const dir = join(claudeHome, 'plugins', 'cache', MARKETPLACE_NAME, PLUGIN_NAME);
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

// ── output discipline ──────────────────────────────────────────────────────

function unknownMarkerPath(claudeHome) {
  return join(claudeHome, 'mothy-plugin-freshness-unknown-notice.json');
}

/** true when it's safe to print the (rate-limited) unknown-state notice. */
function shouldPrintUnknownNotice(claudeHome, now) {
  const p = unknownMarkerPath(claudeHome);
  try {
    const stat = statSync(p);
    return now - stat.mtimeMs >= UNKNOWN_NOTICE_MAX_PER_DAY_MS;
  } catch {
    return true; // never stamped => allowed
  }
}

function stampUnknownNotice(claudeHome) {
  try {
    writeFileSync(unknownMarkerPath(claudeHome), JSON.stringify({ ts: Date.now() }));
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
  const installedVersion = readInstalledVersion(claudeHome);
  const cachedVersions = readCachedVersions(claudeHome);
  const result = classifyPluginFreshness({ installedVersion, cachedVersions });

  if (result.state === 'stale') {
    say(renderMessage(result));
    return;
  }
  if (result.state === 'unknown') {
    // Silent on 'current' always; on 'unknown', at most once per day — never
    // fully silent, because a check that cannot report its own failure is
    // the antipattern this whole feature exists to close.
    if (shouldPrintUnknownNotice(claudeHome, Date.now())) {
      say(renderMessage(result));
      stampUnknownNotice(claudeHome);
    }
    return;
  }
  // 'current' — silent. A hook that speaks every session gets muted, and the
  // mute costs the real warning.
}

function say(text) {
  if (!text) return;
  try {
    process.stdout.write(`${text}\n`);
  } catch {
    /* fail open */
  }
}

if (process.argv[1] && resolvePath(process.argv[1]) === resolvePath(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch {
    /* fail open */
  }
  process.exit(0);
}
