/**
 * plugin-freshness.test.mjs — guard against a fix that shipped but never loaded.
 *
 * THE INCIDENT (2026-08-23). This repo ships PreCompact + post-compaction hooks
 * so an assistant that gets auto-compacted resumes with real context instead of
 * a lossy summary. Measured that morning: the machine had
 * mothy@mothy-marketplace 0.7.0 INSTALLED while the repo was at 0.16.0. NINE
 * versions of handoff fixes had never loaded. ${CLAUDE_PLUGIN_ROOT} resolved to
 * the 0.7.0 directory, so the running notice was 0.7.0's — which tells the
 * assistant "read .claude/precompact-state.md, it does NOT contain reasoning or
 * rejected approaches". That sentence became FALSE at 0.14.0. The assistant
 * believed it, never opened the file, and answered a direct question about its
 * own park state from memory while a correct snapshot sat on disk.
 *
 * The fix existed and was pushed. Nothing checked that it was LOADED. That is
 * the whole bug class check-plugin-freshness.mjs exists to close: a fix that
 * ships is not a fix that runs.
 *
 * THE LOAD-BEARING DETAIL — version comparison is NUMERIC, per component.
 * Never string-compare, never Array.prototype.sort() without a comparator.
 * Measured on the REAL cache directory on this machine:
 *
 *   ['0.1.0','0.1.1','0.15.0','0.16.0','0.3.2','0.4.3','0.4.9','0.7.0','0.17.0']
 *     naive string sort  -> newest = '0.7.0'   WRONG
 *     numeric per-part   -> newest = '0.17.0'  RIGHT
 *
 * '0.7.0' is PRECISELY the stale version that was installed. A guard built the
 * obvious way would report state:'current' forever on this exact machine —
 * silently useless, in the one situation it exists for. F1 pins this.
 *
 * HONESTY RULES asserted here (this repo's house discipline):
 *   - 'unknown' must NEVER collapse into 'current' (F5, F6, F7).
 *   - one unparseable cached entry among parseable ones is skipped, not fatal
 *     (F8) — but if NOTHING parses, 'unknown' (F7).
 *   - equal versions => 'current', SILENT (F3). Installed newer than every
 *     cached entry => 'current' — a local dev install is not stale (F4).
 *   - READ-ONLY: no auto-update, no network (F10, source-level).
 *   - ALWAYS exit 0 (F11).
 *   - kill switch MOTHY_PLUGIN_FRESHNESS, default ON (F9).
 *   - registered on SessionStart in BOTH hooks/hooks.json and
 *     .claude-plugin/plugin.json — the SAME duplication precompact-hooks.test.mjs
 *     already documents and requires, because this repo does not know which one
 *     a given Claude Code version reads (F12).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, existsSync, symlinkSync, utimesSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyPluginFreshness,
  parseVersion,
  selectInstalledEntry,
  readCachedVersions,
  readInstalledVersion,
  readMarketplaceUpstream,
  renderMessage,
} from '../plugins/mothy/hooks/check-plugin-freshness.mjs';
import { eventsFromHooksFile } from './hook-wiring.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS_DIR = join(ROOT, 'plugins', 'mothy', 'hooks');
const SCRIPT = join(HOOKS_DIR, 'check-plugin-freshness.mjs');
const HOOKS_JSON = join(HOOKS_DIR, 'hooks.json');
const PLUGIN_JSON = join(ROOT, 'plugins', 'mothy', '.claude-plugin', 'plugin.json');

// ── F1-F8: the pure core ────────────────────────────────────────────────────

test('F1 real cached-version list from this machine: numeric compare finds 0.17.0, not the string-sort trap', () => {
  const cachedVersions = [
    '0.1.0', '0.1.1', '0.15.0', '0.16.0', '0.3.2', '0.4.3', '0.4.9', '0.7.0', '0.17.0',
  ];
  const naiveStringSortNewest = [...cachedVersions].sort().at(-1);
  assert.equal(
    naiveStringSortNewest,
    '0.7.0',
    'sanity check on the trap itself: a naive string sort of this exact list must return 0.7.0 (the stale version that shipped), proving the trap is real',
  );

  const result = classifyPluginFreshness({ installedVersion: '0.7.0', cachedVersions });
  assert.equal(
    result.state,
    'stale',
    'installed 0.7.0 against a cache holding 0.17.0 must be stale — a naive string sort returns 0.7.0 as "newest" and would wrongly report current, exactly reproducing the 2026-08-23 incident',
  );
  assert.equal(result.newest, '0.17.0');
});

test('F2 ten vs nine component ordering: 0.10.0 beats 0.9.0 numerically', () => {
  const result = classifyPluginFreshness({ installedVersion: '0.9.0', cachedVersions: ['0.9.0', '0.10.0'] });
  assert.equal(result.state, 'stale');
  assert.equal(result.newest, '0.10.0');
});

test('F3 equal versions => current (with positive upstream evidence — see U3 for why that is required)', () => {
  const result = classifyPluginFreshness({
    installedVersion: '0.17.0',
    cachedVersions: ['0.17.0', '0.16.0'],
    upstream: { version: '0.17.0', reason: null, ageMs: 60_000, fresh: true },
  });
  assert.equal(result.state, 'current');
});

test('F4 installed newer than every known version => current (local dev install)', () => {
  const result = classifyPluginFreshness({
    installedVersion: '0.99.0',
    cachedVersions: ['0.17.0', '0.16.0'],
    upstream: { version: '0.17.0', reason: null, ageMs: 60_000, fresh: true },
  });
  assert.equal(result.state, 'current');
});

test('F5 installed version missing/null => unknown, never current', () => {
  assert.equal(classifyPluginFreshness({ installedVersion: null, cachedVersions: ['0.17.0'] }).state, 'unknown');
  assert.equal(classifyPluginFreshness({ installedVersion: undefined, cachedVersions: ['0.17.0'] }).state, 'unknown');
  assert.equal(classifyPluginFreshness({ installedVersion: '', cachedVersions: ['0.17.0'] }).state, 'unknown');
});

test('F6 nothing cached and no upstream reading => unknown, never current', () => {
  const result = classifyPluginFreshness({ installedVersion: '0.17.0', cachedVersions: [] });
  assert.equal(result.state, 'unknown');
});

test('F7 every cached entry unparseable and no upstream reading => unknown', () => {
  const result = classifyPluginFreshness({ installedVersion: '0.7.0', cachedVersions: ['nightly', 'tmp'] });
  assert.equal(result.state, 'unknown');
});

test('F8 one unparseable entry among parseable ones is skipped, not fatal', () => {
  const result = classifyPluginFreshness({ installedVersion: '0.7.0', cachedVersions: ['0.16.0', 'nightly'] });
  assert.equal(result.state, 'stale');
  assert.equal(result.newest, '0.16.0');
});

// ── F9: kill switch ─────────────────────────────────────────────────────────

// A cache subdirectory only counts as a version when it holds a real plugin
// unpack (R4). Fixtures therefore write .claude-plugin/plugin.json; `bare`
// entries deliberately do NOT, so a stray scratch directory can be simulated.
function makeCacheEntry(cacheDir, version, { bare = false } = {}) {
  const dir = join(cacheDir, version);
  mkdirSync(dir, { recursive: true });
  if (bare) return;
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'mothy', version }));
}

/**
 * Write the LOCAL MARKETPLACE CHECKOUT (the upstream signal) plus the
 * known_marketplaces.json record that says when it was last refreshed. Both
 * halves are needed: the manifest says WHAT upstream advertises, the record
 * says whether that reading is worth anything.
 */
function writeMarketplace(claudeHome, { version, lastUpdated }) {
  const pluginsDir = join(claudeHome, 'plugins');
  const checkout = join(pluginsDir, 'marketplaces', 'mothy-marketplace');
  mkdirSync(join(checkout, '.claude-plugin'), { recursive: true });
  writeFileSync(
    join(checkout, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({ name: 'mothy-marketplace', plugins: [{ name: 'mothy', source: './plugins/mothy', version }] }),
  );
  const record = { 'mothy-marketplace': { installLocation: checkout } };
  if (lastUpdated) record['mothy-marketplace'].lastUpdated = lastUpdated;
  mkdirSync(pluginsDir, { recursive: true });
  writeFileSync(join(pluginsDir, 'known_marketplaces.json'), JSON.stringify(record));
}

function marketplaceHomeFixture({ version, lastUpdated }) {
  const dir = mkdtempSync(join(tmpdir(), 'mothy-marketplace-home-'));
  mkdirSync(join(dir, 'plugins'), { recursive: true });
  writeMarketplace(dir, { version, lastUpdated });
  return dir;
}

function claudeHomeFixture({ installedVersion, cachedVersions, entries, bareCachedVersions = [], marketplace }) {
  const dir = mkdtempSync(join(tmpdir(), 'mothy-plugin-freshness-'));
  const pluginsDir = join(dir, 'plugins');
  mkdirSync(pluginsDir, { recursive: true });
  writeFileSync(
    join(pluginsDir, 'installed_plugins.json'),
    JSON.stringify({
      plugins: { 'mothy@mothy-marketplace': entries || [{ scope: 'user', version: installedVersion }] },
    }),
  );
  const cacheDir = join(pluginsDir, 'cache', 'mothy-marketplace', 'mothy');
  mkdirSync(cacheDir, { recursive: true });
  for (const v of cachedVersions || []) makeCacheEntry(cacheDir, v);
  for (const v of bareCachedVersions) makeCacheEntry(cacheDir, v, { bare: true });
  if (marketplace) writeMarketplace(dir, marketplace);
  return dir;
}

function markerPath(claudeHome) {
  return join(claudeHome, 'mothy-plugin-freshness-unknown-notice.json');
}

function run(claudeHome, extraEnv = {}, opts = {}) {
  return spawnSync(process.execPath, [opts.script || SCRIPT], {
    encoding: 'utf8',
    cwd: opts.cwd,
    env: { ...process.env, CLAUDE_CONFIG_DIR: claudeHome, ...extraEnv },
  });
}

test('F9 kill switch disables entirely for each off-value; unset stays ON', () => {
  const home = claudeHomeFixture({ installedVersion: '0.7.0', cachedVersions: ['0.17.0'] });

  for (const offValue of ['0', 'off', 'false', 'no']) {
    const res = run(home, { MOTHY_PLUGIN_FRESHNESS: offValue });
    assert.equal(res.status, 0);
    assert.equal(res.stdout.trim(), '', `off-value "${offValue}" must produce no output`);
  }

  const onRes = run(home, {});
  assert.equal(onRes.status, 0);
  assert.match(onRes.stdout, /WARNING/, 'unset kill switch must still warn on a genuinely stale install');
});

// ── F10: source-level — no auto-update, no network ─────────────────────────

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('F10 source carries no auto-update or network primitive (comments stripped before matching)', () => {
  const src = stripComments(readFileSync(SCRIPT, 'utf8'));
  assert.doesNotMatch(src, /plugin update/, 'must never invoke `claude plugin update` itself — the human decides');
  assert.doesNotMatch(src, /\bexecFile\b|\bspawn\b|\bspawnSync\b/, 'must not shell out to claude or anything else');
  assert.doesNotMatch(src, /\bfetch\s*\(/, 'must not touch the network');
  assert.doesNotMatch(src, /\bhttps?:\/\//i, 'must not reference a network endpoint');
  assert.doesNotMatch(src, /require\(['"]https?['"]\)|from ['"]node:https?['"]/, 'must not import an http client');
});

// ── F11: E2E ─────────────────────────────────────────────────────────────

test('F11 E2E stale: real script warns naming both versions, exits 0', () => {
  const home = claudeHomeFixture({ installedVersion: '0.7.0', cachedVersions: ['0.16.0', '0.17.0'] });
  const res = run(home);
  assert.equal(res.status, 0, `must always exit 0 (stderr: ${res.stderr})`);
  assert.match(res.stdout, /0\.7\.0/, 'must name the installed version');
  assert.match(res.stdout, /0\.17\.0/, 'must name the newest cached version');
});

test('F11 E2E current: real script is silent, exits 0', () => {
  const home = claudeHomeFixture({
    installedVersion: '0.17.0',
    cachedVersions: ['0.17.0', '0.16.0'],
    marketplace: { version: '0.17.0', lastUpdated: new Date().toISOString() },
  });
  const res = run(home);
  assert.equal(res.status, 0, `must always exit 0 (stderr: ${res.stderr})`);
  assert.equal(res.stdout.trim(), '', 'must be silent when current — a hook that speaks every session gets muted');
});

// ── F12: wiring in BOTH declarations ────────────────────────────────────────

function sessionStartCommands(sessionStartArray) {
  const commands = [];
  for (const entry of sessionStartArray || []) {
    for (const h of entry.hooks || []) {
      if (h.type === 'command') commands.push(h.command);
    }
  }
  return commands;
}

test('F12a check-plugin-freshness.mjs is registered on SessionStart in hooks/hooks.json', () => {
  const doc = JSON.parse(readFileSync(HOOKS_JSON, 'utf8'));
  const commands = sessionStartCommands(eventsFromHooksFile(doc).SessionStart);
  assert.ok(
    commands.some((c) => c.includes('check-plugin-freshness.mjs')),
    `hooks/hooks.json SessionStart must run check-plugin-freshness.mjs; found: ${JSON.stringify(commands)}`,
  );
});

test('F12b check-plugin-freshness.mjs is registered on SessionStart in .claude-plugin/plugin.json', () => {
  const doc = JSON.parse(readFileSync(PLUGIN_JSON, 'utf8'));
  const commands = sessionStartCommands(doc.hooks?.SessionStart);
  assert.ok(
    commands.some((c) => c.includes('check-plugin-freshness.mjs')),
    `.claude-plugin/plugin.json SessionStart must run check-plugin-freshness.mjs; found: ${JSON.stringify(commands)}`,
  );
});


// ── R1-R5: adversarial-review regressions (2026-08-23) ─────────────────────
//
// Every one of these is the SAME bug class the hook itself exists to close: a
// guard that silently does not work. They are pinned separately because each
// one can be reintroduced alone.

test('R1a multi-entry install: the PROJECT-scoped entry matching cwd is the one that counts, not a newer user-scoped sibling', () => {
  // The live installed_plugins.json on this machine holds
  // frontend-design@claude-plugins-official TWICE (scope user + scope project),
  // so multi-entry is real. If the user entry (0.17.0) were compared while the
  // project entry (0.7.0) is what this session loads, the guard would answer
  // 'current' while genuinely STALE — worse than unknown->current.
  const entries = [
    { scope: 'user', version: '0.17.0' },
    { scope: 'project', projectPath: '/Users/rich/Documents/GitHub/mothy-plugins', version: '0.7.0' },
  ];
  const picked = selectInstalledEntry(entries, '/Users/rich/Documents/GitHub/mothy-plugins/tests');
  assert.equal(picked.version, '0.7.0', 'the project-scoped entry containing the cwd is the entry the session loads');
  assert.equal(
    classifyPluginFreshness({ installedVersion: picked.version, installedReason: picked.reason, cachedVersions: ['0.17.0'] }).state,
    'stale',
    'must report stale — reporting current here is the exact silent failure this hook exists to prevent',
  );
});

test('R1b a project-scoped entry for a DIFFERENT project never wins; the user-scoped entry does', () => {
  const entries = [
    { scope: 'project', projectPath: '/Users/rich/Documents/GitHub/commandiq', version: '0.7.0' },
    { scope: 'user', version: '0.17.0' },
  ];
  const picked = selectInstalledEntry(entries, '/Users/rich/Documents/GitHub/mothy-plugins');
  assert.equal(picked.version, '0.17.0');
});

test('R1c ambiguity resolves to UNKNOWN with a reason — never to a pick reported as current', () => {
  const entries = [
    { scope: 'user', version: '0.7.0' },
    { scope: 'user', version: '0.17.0' },
  ];
  const picked = selectInstalledEntry(entries, '/tmp/anywhere');
  assert.equal(picked.version, null, 'two surviving entries with different versions: we cannot tell which loads');
  assert.equal(picked.reason, 'ambiguous_installed_entries');

  const result = classifyPluginFreshness({
    installedVersion: picked.version,
    installedReason: picked.reason,
    cachedVersions: ['0.17.0'],
  });
  assert.equal(result.state, 'unknown');
  assert.equal(result.reason, 'ambiguous_installed_entries', 'the reason must survive into the reported state, not be flattened into installed_version_unreadable');
});

test('R1d E2E: the real script reads the project-scoped entry for its cwd and warns', () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'mothy-project-'));
  const home = claudeHomeFixture({
    cachedVersions: ['0.17.0'],
    entries: [
      { scope: 'user', version: '0.17.0' },
      { scope: 'project', projectPath: projectDir, version: '0.7.0' },
    ],
  });
  const res = run(home, {}, { cwd: projectDir });
  assert.equal(res.status, 0, `must always exit 0 (stderr: ${res.stderr})`);
  assert.match(res.stdout, /WARNING/, 'the loaded entry is 0.7.0 against a cached 0.17.0 — that is stale');
  assert.match(res.stdout, /0\.7\.0/);
});

test('R2 entrypoint guard survives a symlinked invocation path (import.meta.url is realpathed, path.resolve is not)', () => {
  const home = claudeHomeFixture({ installedVersion: '0.7.0', cachedVersions: ['0.17.0'] });
  const linkDir = mkdtempSync(join(tmpdir(), 'mothy-symlink-'));
  const link = join(linkDir, 'check-plugin-freshness.mjs');
  symlinkSync(SCRIPT, link);

  const res = run(home, {}, { script: link });
  assert.equal(res.status, 0, `must always exit 0 (stderr: ${res.stderr})`);
  assert.match(
    res.stdout,
    /WARNING/,
    'invoked through a symlink the hook must still run — path.resolve does not canonicalize, so an uncanonicalized comparison makes the body silently never execute',
  );
});

test('R3 a notice that failed to reach stdout must NOT arm the 24h suppression marker', () => {
  // unknown state: valid installed version, empty cache.
  const home = claudeHomeFixture({ installedVersion: '0.17.0', cachedVersions: [] });

  // fd 1 duped from a READ-ONLY fd: every write to stdout fails EBADF.
  // (`>&-` alone does not reproduce it — Node reopens a closed fd 1 onto
  // /dev/null at startup, so the write silently succeeds.)
  const closed = spawnSync('/bin/sh', ['-c', `exec "$0" "$1" < /etc/hosts 1<&0`, process.execPath, SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_CONFIG_DIR: home },
  });
  assert.equal(
    closed.status,
    0,
    `must always exit 0 even when stdout is unwritable (stderr: ${closed.stderr}) — process.stdout.write throws ASYNCHRONOUSLY here and crashes the hook with status 1`,
  );
  assert.equal(
    existsSync(markerPath(home)),
    false,
    'the cooldown may be stamped only on CONFIRMED delivery — arming a day of silence for a warning nobody received is the failure this hook exists to prevent',
  );

  // and with stdout open the notice is delivered and the marker IS armed.
  const ok = run(home);
  assert.match(ok.stdout, /could not determine plugin freshness/);
  assert.equal(existsSync(markerPath(home)), true, 'a delivered notice does stamp the cooldown');

  const second = run(home);
  assert.equal(second.stdout.trim(), '', 'and the stamped cooldown then suppresses the repeat');
});

test('R4a a version string with fewer than three numeric components is not a version', () => {
  assert.equal(parseVersion('9'), null, "a stray directory named '9' must never out-rank 0.17.0");
  assert.equal(parseVersion('0.17'), null);
  assert.deepEqual(parseVersion('0.17.0'), [0, 17, 0]);
});

test('R4b a bare cache directory is not counted as a version', () => {
  const home = claudeHomeFixture({
    installedVersion: '0.7.0',
    cachedVersions: ['0.16.0'],
    bareCachedVersions: ['9', 'scratch', '0.99.0'],
  });
  assert.deepEqual(
    readCachedVersions(home).sort(),
    ['0.16.0'],
    'only directories holding .claude-plugin/plugin.json are real plugin unpacks',
  );
});

test('R4c a stray high-sorting directory cannot manufacture a permanent false stale', () => {
  const home = claudeHomeFixture({
    installedVersion: '0.17.0',
    cachedVersions: ['0.17.0'],
    bareCachedVersions: ['9'],
    marketplace: { version: '0.17.0', lastUpdated: new Date().toISOString() },
  });
  const res = run(home);
  assert.equal(res.status, 0, `must always exit 0 (stderr: ${res.stderr})`);
  assert.equal(
    res.stdout.trim(),
    '',
    "a scratch directory named '9' must not out-rank 0.17.0 — a guard that cries wolf ends in the same silence as one that never fires",
  );
});

test('R5 concurrent sessions print the once-per-day unknown notice at most ONCE (atomic wx claim, not stat-then-write)', async () => {
  // Deterministic in the fixed direction: `{ flag: 'wx' }` means exactly one
  // process can create the marker, so "at most one printer" holds whether the
  // runs overlap or not. With the stat-then-decide-then-write shape, N
  // overlapping starts all pass the check and all print.
  const home = claudeHomeFixture({ installedVersion: '0.17.0', cachedVersions: [] });
  const N = 8;
  const outs = await Promise.all(
    Array.from({ length: N }, () => new Promise((res) => {
      const child = spawn(process.execPath, [SCRIPT], {
        env: { ...process.env, CLAUDE_CONFIG_DIR: home },
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      let buf = '';
      child.stdout.on('data', (d) => { buf += d; });
      child.on('close', () => res(buf));
    })),
  );
  const printers = outs.filter((o) => o.trim().length > 0).length;
  assert.equal(printers, 1, `exactly one concurrent session may print the notice; ${printers} did`);
});

test('R5b a STALE marker is re-claimed exactly once', () => {
  const home = claudeHomeFixture({ installedVersion: '0.17.0', cachedVersions: [] });
  writeFileSync(markerPath(home), JSON.stringify({ ts: 0 }));
  const twoDaysAgo = Date.now() / 1000 - 2 * 24 * 60 * 60;
  utimesSync(markerPath(home), twoDaysAgo, twoDaysAgo);

  const first = run(home);
  assert.match(first.stdout, /could not determine plugin freshness/, 'a marker older than 24h no longer suppresses');
  const second = run(home);
  assert.equal(second.stdout.trim(), '', 'and the refreshed marker suppresses again');
});

test('R6 readInstalledVersion reports a reason instead of a bare null (so unknown says WHY)', () => {
  const home = mkdtempSync(join(tmpdir(), 'mothy-empty-home-'));
  const got = readInstalledVersion(home, home);
  assert.equal(got.version, null);
  assert.equal(got.reason, 'installed_plugins_unreadable');
});

// ── U1-U9: upstream visibility (2026-09-03) ────────────────────────────────
//
// THE SECOND INCIDENT. The cache-only comparison above can only see versions
// ALREADY UNPACKED on this machine. A user who never refreshes the marketplace
// has nothing newer cached, so the guard reported nothing — forever. Measured
// 2026-09-03: Kevin Cornish ran 0.1.1 from 2026-06-23 to 2026-09-03 (25 minor
// versions, 2.5 months) with no warning, and Rich's own machine sat on 0.26.0
// against an origin at 0.26.5.
//
// The fix reads the LOCAL MARKETPLACE CHECKOUT
// (~/.claude/plugins/marketplaces/mothy-marketplace/.claude-plugin/marketplace.json)
// — the version the marketplace advertises, which is upstream even when no
// build of it was ever unpacked into the cache. The checkout can itself be
// stale, so its own refresh time is read from known_marketplaces.json and
// REPORTED; otherwise the blindness has merely moved one level out.
//
// HONESTY: 'current' now requires POSITIVE upstream evidence. Unreadable
// checkout, unknown refresh time, or a checkout older than
// MARKETPLACE_STALE_AFTER_MS => 'unknown', never 'current'.

test('U1 newer version advertised by the marketplace checkout, nothing newer cached => stale', () => {
  const result = classifyPluginFreshness({
    installedVersion: '0.1.1',
    cachedVersions: ['0.1.1'],
    upstream: { version: '0.26.5', reason: null, ageMs: 60_000, fresh: true },
  });
  assert.equal(
    result.state,
    'stale',
    "Kevin's exact shape: 0.1.1 installed, 0.1.1 the only thing cached, 0.26.5 advertised upstream. Cache-only comparison reports nothing here — that is the 2.5-month silence",
  );
  assert.equal(result.newest, '0.26.5');
  assert.equal(result.newestSource, 'marketplace');
});

test('U2 upstream and cache both consulted; the higher of the two wins', () => {
  const fromCache = classifyPluginFreshness({
    installedVersion: '0.20.0',
    cachedVersions: ['0.26.4'],
    upstream: { version: '0.26.3', reason: null, ageMs: 60_000, fresh: true },
  });
  assert.equal(fromCache.newest, '0.26.4');
  assert.equal(fromCache.newestSource, 'cache');

  const fromMarketplace = classifyPluginFreshness({
    installedVersion: '0.20.0',
    cachedVersions: ['0.26.3'],
    upstream: { version: '0.26.5', reason: null, ageMs: 60_000, fresh: true },
  });
  assert.equal(fromMarketplace.newest, '0.26.5');
  assert.equal(fromMarketplace.newestSource, 'marketplace');
});

test('U3 no upstream evidence at all => unknown, NEVER current', () => {
  const result = classifyPluginFreshness({ installedVersion: '0.26.5', cachedVersions: ['0.26.5'] });
  assert.equal(
    result.state,
    'unknown',
    'installed matching everything cached proves nothing about upstream — that inference is exactly how a 25-version gap stayed silent',
  );
  assert.equal(result.reason, 'upstream_not_checked');
});

test('U4 an unreadable marketplace checkout => unknown with its own reason', () => {
  const result = classifyPluginFreshness({
    installedVersion: '0.26.5',
    cachedVersions: ['0.26.5'],
    upstream: { version: null, reason: 'marketplace_checkout_unreadable', ageMs: null, fresh: false },
  });
  assert.equal(result.state, 'unknown');
  assert.equal(result.reason, 'marketplace_checkout_unreadable');
});

test('U5 a STALE checkout cannot certify current — the blindness is reported, not moved one level out', () => {
  const ageMs = 40 * 24 * 60 * 60 * 1000;
  const result = classifyPluginFreshness({
    installedVersion: '0.26.5',
    cachedVersions: ['0.26.5'],
    upstream: { version: '0.26.5', reason: 'marketplace_checkout_stale', ageMs, fresh: false },
  });
  assert.equal(result.state, 'unknown', 'a checkout nobody has refreshed in 40 days says nothing about origin');
  assert.equal(result.reason, 'marketplace_checkout_stale');
  assert.equal(result.upstreamAgeMs, ageMs);
  assert.match(renderMessage(result), /40 days/, 'the notice must name how old the checkout is, or the user cannot act on it');
});

test('U6 a stale checkout that nonetheless shows a NEWER version still reports stale (positive evidence outranks freshness)', () => {
  const result = classifyPluginFreshness({
    installedVersion: '0.1.1',
    cachedVersions: ['0.1.1'],
    upstream: { version: '0.20.0', reason: 'marketplace_checkout_stale', ageMs: 40 * 24 * 60 * 60 * 1000, fresh: false },
  });
  assert.equal(result.state, 'stale', 'an old checkout showing something newer is proof a newer version exists; only the "you are current" claim needs freshness');
  assert.equal(result.newest, '0.20.0');
});

test('U7 fresh checkout agreeing with the installed version => current, silent', () => {
  const result = classifyPluginFreshness({
    installedVersion: '0.26.5',
    cachedVersions: ['0.26.5'],
    upstream: { version: '0.26.5', reason: null, ageMs: 60_000, fresh: true },
  });
  assert.equal(result.state, 'current');
  assert.equal(renderMessage(result), '');
});

test('U8 readMarketplaceUpstream reads the checkout version and grades its own freshness', () => {
  const now = Date.UTC(2026, 8, 3, 12, 0, 0);

  const fresh = marketplaceHomeFixture({ version: '0.26.5', lastUpdated: new Date(now - 60_000).toISOString() });
  const gotFresh = readMarketplaceUpstream(fresh, now);
  assert.equal(gotFresh.version, '0.26.5');
  assert.equal(gotFresh.fresh, true);

  const old = marketplaceHomeFixture({ version: '0.26.5', lastUpdated: new Date(now - 40 * 24 * 60 * 60 * 1000).toISOString() });
  const gotOld = readMarketplaceUpstream(old, now);
  assert.equal(gotOld.version, '0.26.5');
  assert.equal(gotOld.fresh, false, 'older than MARKETPLACE_STALE_AFTER_MS');
  assert.equal(gotOld.reason, 'marketplace_checkout_stale');

  const noStamp = marketplaceHomeFixture({ version: '0.26.5', lastUpdated: null });
  const gotNoStamp = readMarketplaceUpstream(noStamp, now);
  assert.equal(gotNoStamp.fresh, false);
  assert.equal(gotNoStamp.reason, 'marketplace_refresh_time_unknown');

  const future = marketplaceHomeFixture({ version: '0.26.5', lastUpdated: new Date(now + 60 * 60 * 1000).toISOString() });
  const gotFuture = readMarketplaceUpstream(future, now);
  assert.equal(gotFuture.fresh, false, 'a future-dated stamp is clock skew — never treat it as freshest possible');
  assert.equal(gotFuture.reason, 'marketplace_refresh_time_in_future');

  const missing = mkdtempSync(join(tmpdir(), 'mothy-no-marketplace-'));
  const gotMissing = readMarketplaceUpstream(missing, now);
  assert.equal(gotMissing.version, null);
  assert.equal(gotMissing.reason, 'marketplace_checkout_unreadable');
});

test('U9 E2E: the real script warns from the marketplace checkout alone, with nothing newer in the cache', () => {
  const home = claudeHomeFixture({
    installedVersion: '0.1.1',
    cachedVersions: ['0.1.1'],
    marketplace: { version: '0.26.5', lastUpdated: new Date().toISOString() },
  });
  const res = run(home);
  assert.equal(res.status, 0, `must always exit 0 (stderr: ${res.stderr})`);
  assert.match(res.stdout, /WARNING/, "Kevin's shape must now speak; before this change the cache-only comparison was silent for 2.5 months");
  assert.match(res.stdout, /0\.1\.1/);
  assert.match(res.stdout, /0\.26\.5/);
});

test('U10 source still carries no network primitive — the upstream read is a LOCAL file read', () => {
  const src = stripComments(readFileSync(SCRIPT, 'utf8'));
  assert.doesNotMatch(src, /\bfetch\s*\(/, 'the marketplace checkout is on disk; a SessionStart hook must not hang on a socket');
  assert.doesNotMatch(src, /\bhttps?:\/\//i);
});
