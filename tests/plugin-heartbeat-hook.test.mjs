/**
 * plugin-heartbeat-hook.test.mjs — guards for the SessionStart hook that
 * reports this plugin's own version to the fleet endpoint.
 *
 * WHY IT EXISTS. `check-plugin-freshness.mjs` ships INSIDE the plugin, so a
 * DISABLED or uninstalled plugin cannot warn that it is disabled — that hook
 * says so in its own header. Kevin Cornish ran 0.1.1, disabled, for 2.5
 * months and no local guard could ever have spoken. Absence has to be visible
 * somewhere OUTSIDE the machine, which means one outbound POST.
 *
 * THIS REPO IS PUBLIC. Everything below follows from that:
 *
 *   - No secret ships. The write is unauthenticated and the email is
 *     SELF-ASSERTED; the server does the roster gate. Accepted residual,
 *     recorded in the ADR — nobody may later "fix" it by shipping a token.
 *   - The URL is COMPILED IN and there is exactly ONE of them, https. An
 *     env-overridable URL is a compiled-in URL in name only: a poisoned shell
 *     profile would re-point that machine's payload. H10/H11 pin that the
 *     module reads exactly ONE environment variable — the kill switch — and
 *     carries exactly one URL literal.
 *   - The response body is NEVER read (H12). A SessionStart hook's stdout
 *     lands in ~47 model contexts; parsing a server reply would make this an
 *     injection channel into every one of them.
 *   - TWO independent timing bounds (H13 + H14): AbortSignal.timeout(1500) in
 *     the fetch AND an explicit `timeout` in the hook wiring. A single defence
 *     whose failure mode is "session hangs at start on 47 Macs" deserves two.
 *
 * FOUR FIELDS, and the count is the point (H1). install_id, claimed_email,
 * plugin_version, freshness_state. No cwd, no repo, no hostname, no session
 * content, no time-of-day. The first-run notice says exactly that (H16), and
 * with the team announcement declined it is the ONLY consent surface.
 *
 * NOTE FOR ANYONE ADDING A TEST HERE: no test may ever construct an in-domain
 * email fixture AND let the real script run its POST — that would fire live
 * traffic at production from CI. Spawned E2E cases below deliberately use an
 * out-of-domain / absent email, or the kill switch.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HEARTBEAT_URL,
  KILL_SWITCH,
  FRESHNESS_STATES,
  PAYLOAD_FIELDS,
  FETCH_TIMEOUT_MS,
  IN_DOMAIN,
  isDisabled,
  isInDomainEmail,
  normalizeFreshnessState,
  buildPayload,
  decideHeartbeat,
  renderFirstRunNotice,
  ensureInstallId,
  readAccountEmail,
  readRunningPluginVersion,
  claimDailySlot,
  releaseDailySlot,
  postHeartbeat,
  classifyDeliveryStatus,
  shouldReleaseSlotAfterPost,
  DELIVERY_DELIVERED,
  DELIVERY_REJECTED,
  DELIVERY_NOT_DELIVERED,
  MAX_EMAIL_CHARS,
  MAX_VERSION_CHARS,
} from '../plugins/mothy/hooks/report-plugin-heartbeat.mjs';

import { eventsFromHooksFile } from './hook-wiring.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SCRIPT = join(ROOT, 'plugins', 'mothy', 'hooks', 'report-plugin-heartbeat.mjs');
const HOOKS_JSON = join(ROOT, 'plugins', 'mothy', 'hooks', 'hooks.json');
const PLUGIN_JSON = join(ROOT, 'plugins', 'mothy', '.claude-plugin', 'plugin.json');
const TELEMETRY_DOC = join(ROOT, 'plugins', 'mothy', 'docs', 'telemetry.md');

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function homeFixture({ email, claudeDir = true } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'mothy-hb-'));
  if (claudeDir) mkdirSync(join(home, '.claude'), { recursive: true });
  if (email !== undefined) {
    writeFileSync(
      join(home, '.claude.json'),
      JSON.stringify({ userID: 'x', oauthAccount: { emailAddress: email } }),
    );
  }
  return home;
}

function samplePayload() {
  return buildPayload({
    installId: '11111111-2222-4333-8444-555555555555',
    claimedEmail: 'kevin@mothandflamevr.com',
    pluginVersion: '0.26.6',
    freshnessState: 'unknown',
  }).payload;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function sessionStartCommands(sessionStartArray) {
  const out = [];
  for (const entry of sessionStartArray || []) {
    for (const h of entry.hooks || []) if (h.type === 'command') out.push(h);
  }
  return out;
}

// ── H1: the payload is exactly four fields ────────────────────────────────

test('H1 the wire payload carries exactly the four declared fields and nothing else', () => {
  const built = buildPayload({
    installId: '11111111-2222-4333-8444-555555555555',
    claimedEmail: 'kevin@mothandflamevr.com',
    pluginVersion: '0.26.6',
    freshnessState: 'stale',
  });
  assert.equal(built.ok, true);
  assert.deepEqual(Object.keys(built.payload).sort(), [...PAYLOAD_FIELDS].sort());
  assert.deepEqual([...PAYLOAD_FIELDS].sort(), [
    'claimed_email', 'freshness_state', 'install_id', 'plugin_version',
  ]);
  // The NOT list, asserted rather than promised.
  for (const forbidden of ['cwd', 'repo', 'hostname', 'session_id', 'os', 'ts', 'timestamp', 'enabled']) {
    assert.equal(Object.hasOwn(built.payload, forbidden), false, `${forbidden} must never ride the wire`);
  }
});

test('H1b buildPayload refuses an incomplete record rather than sending a partial one', () => {
  assert.equal(buildPayload({ installId: null, claimedEmail: 'a@mothandflamevr.com', pluginVersion: '1.0.0', freshnessState: 'current' }).ok, false);
  assert.equal(buildPayload({ installId: '11111111-2222-4333-8444-555555555555', claimedEmail: '', pluginVersion: '1.0.0', freshnessState: 'current' }).ok, false);
  assert.equal(buildPayload({ installId: '11111111-2222-4333-8444-555555555555', claimedEmail: 'a@mothandflamevr.com', pluginVersion: null, freshnessState: 'current' }).ok, false);
  assert.equal(buildPayload({ installId: 'not-a-uuid', claimedEmail: 'a@mothandflamevr.com', pluginVersion: '1.0.0', freshnessState: 'current' }).ok, false);
});

// ── H2: kill switch ────────────────────────────────────────────────────────

test('H2 kill switch: off-values disable, everything else (including unset) stays ON', () => {
  for (const off of ['0', 'off', 'false', 'no', 'OFF', ' No ']) {
    assert.equal(isDisabled(off), true, `"${off}" must disable`);
  }
  for (const on of [undefined, '', '1', 'on', 'true', 'yes', 'maybe']) {
    assert.equal(isDisabled(on), false, `"${on}" must NOT disable`);
  }
  assert.equal(KILL_SWITCH, 'MOTHY_PLUGIN_HEARTBEAT');
});

// ── H3/H4: identity gates ─────────────────────────────────────────────────

test('H3 an out-of-domain account email is never sent — the plugin is public and anyone can install it', () => {
  assert.equal(isInDomainEmail('someone@gmail.com'), false);
  assert.equal(isInDomainEmail('someone@notmothandflamevr.com'), false);
  assert.equal(isInDomainEmail('someone@mothandflamevr.com.evil.tld'), false);
  assert.equal(isInDomainEmail('KEVIN@MothAndFlameVR.com'), true);
  assert.equal(IN_DOMAIN, '@mothandflamevr.com');

  const d = decideHeartbeat({
    disabled: false, email: 'someone@gmail.com', pluginVersion: '0.26.6',
    installId: '11111111-2222-4333-8444-555555555555', throttled: false,
  });
  assert.equal(d.send, false);
  assert.equal(d.reason, 'email_out_of_domain');
});

test('H4 no readable account email means nothing is sent, and the reason says so', () => {
  const d = decideHeartbeat({
    disabled: false, email: null, pluginVersion: '0.26.6',
    installId: '11111111-2222-4333-8444-555555555555', throttled: false,
  });
  assert.equal(d.send, false);
  assert.equal(d.reason, 'no_email');

  const home = homeFixture({}); // no .claude.json at all
  assert.equal(readAccountEmail(home), null);
});

test('H4b readAccountEmail reads ONLY the account email, from the CLI config, and tolerates junk', () => {
  const home = homeFixture({ email: 'Kevin@MothAndFlameVR.com ' });
  assert.equal(readAccountEmail(home), 'kevin@mothandflamevr.com');

  const bad = homeFixture({});
  writeFileSync(join(bad, '.claude.json'), 'not json at all');
  assert.equal(readAccountEmail(bad), null);

  const noAccount = homeFixture({});
  writeFileSync(join(noAccount, '.claude.json'), JSON.stringify({ userID: 'x' }));
  assert.equal(readAccountEmail(noAccount), null);
});

// ── H5/H6: install_id ─────────────────────────────────────────────────────

test('H5 an install id we cannot persist means we do NOT send — a fresh id per session floods the store', () => {
  const d = decideHeartbeat({
    disabled: false, email: 'kevin@mothandflamevr.com', pluginVersion: '0.26.6',
    installId: null, throttled: false,
  });
  assert.equal(d.send, false);
  assert.equal(d.reason, 'no_install_id');
});

test('H6 install id is a UUIDv4, minted once, stable across runs, and self-heals a corrupt file', () => {
  const home = homeFixture({ email: 'kevin@mothandflamevr.com' });
  const first = ensureInstallId(home);
  assert.match(first, UUID_V4);
  assert.equal(ensureInstallId(home), first, 'a second run must reuse the persisted id');
  assert.equal(readFileSync(join(home, '.claude', '.mothy-plugin-install-id'), 'utf8').trim(), first);

  writeFileSync(join(home, '.claude', '.mothy-plugin-install-id'), 'garbage-not-a-uuid');
  const healed = ensureInstallId(home);
  assert.match(healed, UUID_V4);
  assert.notEqual(healed, 'garbage-not-a-uuid');
  assert.equal(ensureInstallId(home), healed);
});

test('H6b an unwritable home yields null, never an ephemeral id', () => {
  const home = homeFixture({ email: 'kevin@mothandflamevr.com' });
  const dir = join(home, '.claude');
  chmodSync(dir, 0o500);
  try {
    assert.equal(ensureInstallId(home), null);
  } finally {
    chmodSync(dir, 0o700);
  }
});

// ── H7: freshness_state is a closed enum ──────────────────────────────────

test('H7 freshness_state is a closed enum and unknown NEVER collapses into current', () => {
  assert.deepEqual([...FRESHNESS_STATES].sort(), ['current', 'stale', 'unknown']);
  assert.equal(normalizeFreshnessState('current'), 'current');
  assert.equal(normalizeFreshnessState('stale'), 'stale');
  assert.equal(normalizeFreshnessState('unknown'), 'unknown');
  for (const junk of [undefined, null, '', 'ok', 'CURRENT', 'disabled', 42, {}]) {
    assert.equal(normalizeFreshnessState(junk), 'unknown', `${String(junk)} must degrade to unknown`);
  }
  // The literal we cannot know must not be a state value anywhere.
  assert.equal(FRESHNESS_STATES.includes('disabled'), false);
});

// ── H8/H9: once-per-day throttle, stamped only on confirmed delivery ──────

test('H8 the daily slot is claimed once per UTC day and released for the next one', () => {
  const home = homeFixture({ email: 'kevin@mothandflamevr.com' });
  const day1 = Date.UTC(2026, 8, 3, 12, 0, 0);
  const day1Late = Date.UTC(2026, 8, 3, 23, 59, 0);
  const day2 = Date.UTC(2026, 8, 4, 0, 1, 0);

  assert.equal(claimDailySlot(home, day1), true, 'first run of the day must win the slot');
  assert.equal(claimDailySlot(home, day1Late), false, 'same UTC day must not send again');
  assert.equal(claimDailySlot(home, day2), true, 'a new UTC day re-opens the slot');
});

test('H9 a failed POST releases the slot — a heartbeat nobody received must not arm a day of silence', () => {
  const home = homeFixture({ email: 'kevin@mothandflamevr.com' });
  const now = Date.UTC(2026, 8, 3, 12, 0, 0);
  assert.equal(claimDailySlot(home, now), true);
  releaseDailySlot(home);
  assert.equal(claimDailySlot(home, now), true, 'after a release the same day must be claimable again');
});

test('H9b an unwritable stamp means every session posts — bounded and correct, never silently suppressed', () => {
  const home = homeFixture({ email: 'kevin@mothandflamevr.com' });
  const dir = join(home, '.claude');
  chmodSync(dir, 0o500);
  try {
    const now = Date.UTC(2026, 8, 3, 12, 0, 0);
    assert.equal(claimDailySlot(home, now), true);
    assert.equal(claimDailySlot(home, now), true, 'cannot rate-limit => must not suppress');
  } finally {
    chmodSync(dir, 0o700);
  }
});

// ── H10-H13: source-level pins (comments stripped before matching) ────────

test('H10 the module reads EXACTLY ONE environment variable, and it is the kill switch', () => {
  const src = stripComments(readFileSync(SCRIPT, 'utf8'));
  const reads = src.match(/process\.env/g) || [];
  assert.equal(reads.length, 1, `expected exactly one process.env access, found ${reads.length}`);
  assert.match(src, /process\.env\[KILL_SWITCH\]/, 'the one access must be the kill switch');
  assert.match(src, /const\s+KILL_SWITCH\s*=\s*'MOTHY_PLUGIN_HEARTBEAT'/);
});

test('H11 exactly one URL literal, https, and it is the compiled-in heartbeat endpoint', () => {
  const src = stripComments(readFileSync(SCRIPT, 'utf8'));
  const urls = src.match(/https?:\/\/[^\s'"`]+/g) || [];
  assert.equal(urls.length, 1, `expected exactly one URL literal, found ${urls.length}: ${urls.join(', ')}`);
  assert.equal(urls[0], HEARTBEAT_URL);
  assert.match(HEARTBEAT_URL, /^https:\/\//, 'http:// would put a self-asserted email on the wire in clear');
  assert.doesNotMatch(src, /\bhttp:\/\//, 'no plaintext endpoint anywhere in the module');
});

test('H12 the module never reads a response body — a SessionStart reply would be an injection channel', () => {
  const src = stripComments(readFileSync(SCRIPT, 'utf8'));
  for (const reader of [/\.json\s*\(/, /\.text\s*\(/, /\.arrayBuffer\s*\(/, /\.blob\s*\(/, /\.formData\s*\(/, /\.body\b/]) {
    assert.doesNotMatch(src, reader, `must not touch the response via ${reader}`);
  }
  assert.doesNotMatch(src, /JSON\.parse\s*\(\s*(res|response|reply)/, 'must not parse the server reply');
});

test('H13 the fetch pins redirect:error and an explicit abort timeout', () => {
  const src = stripComments(readFileSync(SCRIPT, 'utf8'));
  assert.match(src, /redirect:\s*'error'/, "a redirect would re-point the payload at a host we never chose");
  assert.match(src, /AbortSignal\.timeout\(\s*FETCH_TIMEOUT_MS\s*\)/);
  assert.match(src, /const\s+FETCH_TIMEOUT_MS\s*=\s*1500\b/);
  assert.equal(FETCH_TIMEOUT_MS, 1500);
  assert.match(src, /method:\s*'POST'/);
});

test('H13b the module never shells out and never auto-updates anything', () => {
  const src = stripComments(readFileSync(SCRIPT, 'utf8'));
  assert.doesNotMatch(src, /\bexecFile\b|\bspawn\b|\bspawnSync\b/);
  assert.doesNotMatch(src, /plugin update/);
});

// ── H14: wiring, in BOTH declarations, with the SECOND timing bound ───────

test('H14 registered on SessionStart in BOTH wiring files, each with an explicit timeout', () => {
  const fromFile = eventsFromHooksFile(JSON.parse(readFileSync(HOOKS_JSON, 'utf8')));
  const fromPlugin = JSON.parse(readFileSync(PLUGIN_JSON, 'utf8')).hooks;

  for (const [label, events] of [['hooks.json', fromFile], ['plugin.json', fromPlugin]]) {
    const entries = sessionStartCommands(events.SessionStart)
      .filter((h) => h.command.includes('report-plugin-heartbeat.mjs'));
    assert.equal(entries.length, 1, `${label} must register the heartbeat hook exactly once`);
    const [h] = entries;
    assert.equal(typeof h.timeout, 'number', `${label}: the hook wiring must carry its own timing bound`);
    assert.ok(h.timeout > 0 && h.timeout <= 10, `${label}: timeout must be small, got ${h.timeout}`);
    assert.match(h.command, /\|\|\s*true/, `${label}: a SessionStart hook must never fail the session`);
  }
});

// ── H15: E2E, real process, never touching production ────────────────────

test('H15 E2E kill switch off: real script exits 0, says nothing, sends nothing', () => {
  const home = homeFixture({ email: 'kevin@mothandflamevr.com' });
  for (const off of ['0', 'off', 'false', 'no']) {
    const res = spawnSync(process.execPath, [SCRIPT], {
      encoding: 'utf8',
      env: { ...process.env, HOME: home, [KILL_SWITCH]: off },
    });
    assert.equal(res.status, 0, `off-value "${off}" (stderr: ${res.stderr})`);
    assert.equal(res.stdout.trim(), '');
    assert.equal(existsSync(join(home, '.claude', '.mothy-plugin-install-id')), false,
      'a disabled hook must not even mint an id');
  }
});

test('H15b E2E out-of-domain account: real script exits 0 and posts nothing', () => {
  const home = homeFixture({ email: 'stranger@example.com' });
  const res = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home },
  });
  assert.equal(res.status, 0, `stderr: ${res.stderr}`);
  assert.equal(res.stdout.trim(), '', 'no notice for someone we would never report on');
});

// ── H16: the first-run notice is the only consent surface ────────────────

test('H16 the first-run notice is <=6 lines and states the four facts, the NOT list, TTL, reader, kill switch, doc', () => {
  const notice = renderFirstRunNotice();
  const lines = notice.split('\n').filter((l) => l.trim() !== '');
  assert.ok(lines.length <= 6, `notice must be <= 6 lines, got ${lines.length}`);

  const lower = notice.toLowerCase();
  for (const fact of ['email', 'version', 'id', 'freshness']) {
    assert.ok(lower.includes(fact), `notice must name the fact "${fact}"`);
  }
  for (const nots of ['cwd', 'repo', 'hostname', 'session content', 'time of day']) {
    assert.ok(lower.includes(nots), `notice must state that "${nots}" is NOT sent`);
  }
  assert.match(notice, /45 days/);
  assert.match(notice, /UTC date/);
  assert.match(notice, /MOTHY_PLUGIN_HEARTBEAT=0/);
  assert.match(notice, /telemetry\.md/);
  assert.doesNotMatch(notice, /https?:\/\//, 'the notice must not introduce a second URL');
});

test('H16b telemetry.md exists and documents delete, retention, opt-out and the throttle failure direction', () => {
  assert.ok(existsSync(TELEMETRY_DOC), `${TELEMETRY_DOC} must exist — it is the notice's only landing place`);
  const doc = readFileSync(TELEMETRY_DOC, 'utf8');
  assert.match(doc, /\.mothy-plugin-install-id/, 'must tell a teammate exactly which file to delete');
  assert.match(doc, /45 days/);
  assert.match(doc, /MOTHY_PLUGIN_HEARTBEAT/);
  for (const field of PAYLOAD_FIELDS) {
    assert.ok(doc.includes(field), `telemetry.md must list the field ${field}`);
  }
  for (const nots of ['cwd', 'hostname', 'session content', 'time of day']) {
    assert.ok(doc.toLowerCase().includes(nots), `telemetry.md must state that ${nots} is not sent`);
  }
});

// ── H17: the POST itself ─────────────────────────────────────────────────

test('H17 postHeartbeat sends one JSON POST and reports delivery without reading the reply', async () => {
  const seen = [];
  const fetchImpl = async (url, opts) => {
    seen.push({ url, opts });
    return { status: 202 };
  };
  const payload = buildPayload({
    installId: '11111111-2222-4333-8444-555555555555',
    claimedEmail: 'kevin@mothandflamevr.com',
    pluginVersion: '0.26.6',
    freshnessState: 'unknown',
  }).payload;

  assert.equal(await postHeartbeat(payload, { fetchImpl }), DELIVERY_DELIVERED);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, HEARTBEAT_URL);
  assert.equal(seen[0].opts.method, 'POST');
  assert.equal(seen[0].opts.redirect, 'error');
  assert.ok(seen[0].opts.signal, 'must carry an abort signal');
  assert.deepEqual(JSON.parse(seen[0].opts.body), payload);
});

test('H17b a throwing or 5xx POST is NOT delivery, and never throws out of the hook', async () => {
  const payload = samplePayload();

  assert.equal(
    await postHeartbeat(payload, { fetchImpl: async () => { throw new Error('boom'); } }),
    DELIVERY_NOT_DELIVERED,
  );
  assert.equal(await postHeartbeat(payload, { fetchImpl: async () => ({ status: 500 }) }), DELIVERY_NOT_DELIVERED);
  assert.equal(await postHeartbeat(payload, { fetchImpl: async () => ({ status: 400 }) }), DELIVERY_REJECTED,
    'a 400 is the server\'s own considered refusal — the schema is our bug, and identical bytes would be refused again');
});

/*
 * H17c/H17d — "the request reached SOMETHING" is not "the record was stored".
 *
 * The server (mothy-mcp api/plugin-heartbeat.mjs) emits exactly three statuses:
 * 202 on every accepted path INCLUDING an internal fault, 400 on a body or
 * schema refusal, 405 on a non-POST. It never emits 404 — a 404 comes from the
 * PLATFORM and means the route is not deployed, which is the state of the world
 * on the day this plugin release lands ahead of the server one. Reading that as
 * a delivery burns the machine's single daily slot and loses the report, every
 * day, per machine, with nothing able to notice.
 */
test('H17c classifyDeliveryStatus is a CLOSED, default-deny mapping — an unknown status is never a delivery', () => {
  for (const ok of [200, 201, 202, 204, 299]) {
    assert.equal(classifyDeliveryStatus(ok), DELIVERY_DELIVERED, `2xx must be delivery: ${ok}`);
  }

  assert.equal(classifyDeliveryStatus(400), DELIVERY_REJECTED,
    'the one refusal the server itself composes — retrying identical bytes today is futile');

  for (const no of [404, 405, 408, 409, 413, 429, 451, 500, 502, 503, 504, 301, 302, 100]) {
    assert.equal(classifyDeliveryStatus(no), DELIVERY_NOT_DELIVERED,
      `not a stored record, so the slot must be given back: ${no}`);
  }

  for (const junk of [null, undefined, NaN, Infinity, '202', 202.5, {}, [], -1, 0, 600, 999]) {
    assert.equal(classifyDeliveryStatus(junk), DELIVERY_NOT_DELIVERED,
      `unreadable status is UNKNOWN, never a confident delivery: ${String(junk)}`);
  }
});

test('H17d a 404 — the route is not deployed — is NOT delivery, so the day is retried', async () => {
  const payload = samplePayload();

  assert.equal(await postHeartbeat(payload, { fetchImpl: async () => ({ status: 404 }) }), DELIVERY_NOT_DELIVERED,
    'a route that does not exist stored nothing; treating it as delivery loses one report per machine per day');
  assert.equal(await postHeartbeat(payload, { fetchImpl: async () => ({ status: 405 }) }), DELIVERY_NOT_DELIVERED);
  assert.equal(await postHeartbeat(payload, { fetchImpl: async () => ({ status: 429 }) }), DELIVERY_NOT_DELIVERED);
  assert.equal(await postHeartbeat(payload, { fetchImpl: async () => ({}) }), DELIVERY_NOT_DELIVERED,
    'a reply with no readable status is UNKNOWN');
});

test('H17e the slot is given back for every outcome that is not a stored or refused record', () => {
  assert.equal(shouldReleaseSlotAfterPost(DELIVERY_DELIVERED), false);
  assert.equal(shouldReleaseSlotAfterPost(DELIVERY_REJECTED), false);
  assert.equal(shouldReleaseSlotAfterPost(DELIVERY_NOT_DELIVERED), true);
  for (const junk of [null, undefined, '', 'ok', true, 0]) {
    assert.equal(shouldReleaseSlotAfterPost(junk), true,
      `an outcome we cannot read must fail toward RETRY, never toward a day of silence: ${String(junk)}`);
  }
});

test('H17f the entrypoint asks the single authority — it never re-derives the release rule inline', () => {
  const src = stripComments(readFileSync(SCRIPT, 'utf8'));
  assert.match(src, /if\s*\(shouldReleaseSlotAfterPost\(/,
    'main must consult shouldReleaseSlotAfterPost');
  assert.equal(/status\s*<\s*500/.test(src), false,
    'the "<500 means delivered" rule is exactly the defect — no consumer may hand-roll it');
  const classifyCallSites = src.match(/(?<!function\s)classifyDeliveryStatus\s*\(/g) ?? [];
  assert.equal(classifyCallSites.length, 1,
    'exactly one consumer of the classifier: postHeartbeat');
  assert.match(src, /export function classifyDeliveryStatus\(/,
    'and the classifier is declared here, once — never inlined by a caller');
});

// ── H18: the running version is the plugin build that is executing ───────

test('H18 plugin_version is read from the RUNNING build own manifest, not from an installed-plugins index', () => {
  const version = readRunningPluginVersion();
  const manifest = JSON.parse(readFileSync(PLUGIN_JSON, 'utf8'));
  assert.equal(version, manifest.version);
  assert.match(version, /^\d+\.\d+\.\d+$/);
});

/*
 * H19 — the client's grammar must be a SUBSET of the server's.
 *
 * The client cannot import the server's validators: mothy-mcp is a separate,
 * private package with a separate deploy, and this plugin ships to ~47 machines
 * as a public repo. A copy is unavoidable (the same reasoning mothy-mcp's own
 * plugin-heartbeat-parity.test.mjs records for its Mothy copy). What is NOT
 * acceptable is a client that accepts what the server refuses: that machine
 * POSTs a 400 every day forever, its row is never written, and the fleet report
 * can only say it has gone silent.
 *
 * These cases are the ones a naive suffix check lets through and the server's
 * ASCII single-'@' dotted-domain pattern rejects. tests/plugin-heartbeat-contract-parity
 * .test.mjs proves the subset relation against the real server module when the
 * sibling checkout is present; THESE run everywhere, including a lone CI.
 */
test('H19 an email the SERVER would refuse is refused HERE — a suffix check is not the grammar', () => {
  const mustReject = [
    'a@b@mothandflamevr.com',        // two '@' — server local-part charset has none
    '.rich@mothandflamevr.com',      // leading dot
    'rich.@mothandflamevr.com',      // trailing dot before '@'
    'rich..h@mothandflamevr.com',    // consecutive dots
    'ri\u00e7h@mothandflamevr.com',       // non-ASCII local part
    'ri(ch)@mothandflamevr.com',     // parens are not in the server charset
    'ri:ch@mothandflamevr.com',      // ':' — a Redis key segment separator
    'ri ch@mothandflamevr.com',           // ASCII space
    'ri\u00a0ch@mothandflamevr.com',      // NBSP
    'ri\ufeffch@mothandflamevr.com',      // zero-width no-break space
    '@mothandflamevr.com',           // empty local part
    'rich@evil.com',                 // out of domain
    'rich@notmothandflamevr.com',    // suffix match that is not our domain
  ];
  for (const bad of mustReject) {
    assert.equal(isInDomainEmail(bad), false, `must be refused locally: ${JSON.stringify(bad)}`);
  }
});

test('H19b it is not vacuous — the real shapes people actually have are still accepted', () => {
  const mustAccept = [
    'kevin@mothandflamevr.com',
    'first.last@mothandflamevr.com',
    'rich+tag@mothandflamevr.com',
    'a_b-c@mothandflamevr.com',
    'KEVIN@MOTHANDFLAMEVR.COM',
    '  kevin@mothandflamevr.com  ',
  ];
  for (const good of mustAccept) {
    assert.equal(isInDomainEmail(good), true, `must still be accepted: ${JSON.stringify(good)}`);
  }
});

test('H19c the subdomain trap: an @x.mothandflamevr.com address is NOT this domain', () => {
  assert.equal(isInDomainEmail('rich@mail.mothandflamevr.com'), false);
  assert.equal(isInDomainEmail('rich@mothandflamevr.com.evil.com'), false);
});

test('H19d the length caps are the server\'s own numbers, not a second opinion', () => {
  assert.equal(MAX_EMAIL_CHARS, 254);
  assert.equal(MAX_VERSION_CHARS, 16);
  const local = 'a'.repeat(MAX_EMAIL_CHARS - IN_DOMAIN.length + 1);
  assert.equal(
    buildPayload({
      installId: '11111111-2222-4333-8444-555555555555',
      claimedEmail: `${local}${IN_DOMAIN}`,
      pluginVersion: '0.26.6',
      freshnessState: 'unknown',
    }).reason,
    'bad_claimed_email',
  );
});
