/**
 * Cross-repo PARITY for the heartbeat grammar.
 *
 * `plugins/mothy/hooks/report-plugin-heartbeat.mjs` validates a heartbeat before
 * it posts; mothy-mcp's `lib/plugin-fleet-state.mjs` validates it again on
 * arrival and REFUSES what it does not recognize. There is no shared package to
 * import - mothy-mcp is a separate, private deploy and this plugin is a public
 * repo installed on ~47 machines - so a copy of the grammar is unavoidable, the
 * same reasoning mothy-mcp's own `plugin-heartbeat-parity.test.mjs` records for
 * its Mothy copy. What is NOT acceptable is DRIFT.
 *
 * The direction that matters is one-way: every value the CLIENT is willing to
 * send, the SERVER must be willing to store. The reverse is fine and expected -
 * a client narrower than the server costs nothing. A client WIDER than the
 * server is the bug: that machine POSTs a record the server refuses, the write
 * is a 400 every single day, its row is never written, and nothing local can
 * say so. (`classifyDeliveryStatus` deliberately reads that 400 as `rejected`
 * and keeps the day's slot - retrying identical bytes is futile - so the machine
 * reads as SILENT in the fleet report, and silence pages. Loud off the machine
 * is the whole design; this test is what stops it being needed.)
 *
 * SKIPS when the sibling checkout is absent - this repo's CI is a lone public
 * checkout and the sibling is private, so a hard failure there would be a
 * permanent red about a file CI cannot see. A skip is honest ("we could not
 * look"); a pass would not be. The skip REASON is printed, never swallowed.
 * Override the location with MOTHY_MCP_REPO_DIR.
 *
 * -- DELIBERATELY NOT ASSERTED HERE, AND WHY (named, not hidden) -------------
 *
 * The WIRE SHAPE is not covered by this file. Measured 2026-09-03: the server's
 * REQUIRED_WIRE_FIELDS is seven - schema_version, claimed_email, plugin_version,
 * freshness_state, freshness_reason, install_scope, install_id - and this client
 * sends four, so `parseHeartbeatBody` answers {ok:false, reason:'missing_field'}
 * for EVERY payload this client can build. That is a live cross-repo contract
 * gap, not a grammar drift, and closing it is not a decision this repo can take
 * alone: it needs a `freshness_reason` the client can honestly emit when its own
 * local check throws (no member of the server's closed enum says "the check
 * failed"), an install-scope selector that does not fork the one authority in
 * check-plugin-freshness.mjs, and an update to the consent surface, which today
 * promises four fields and says the count is the point. Asserting the wire shape
 * here before that decision would either redden the gate over somebody else's
 * open question or, worse, be quietly scoped around later.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  isInDomainEmail,
  buildPayload,
  FRESHNESS_STATES,
  MAX_EMAIL_CHARS,
  MAX_VERSION_CHARS,
} from '../plugins/mothy/hooks/report-plugin-heartbeat.mjs';

function siblingContractPath() {
  const override = process.env.MOTHY_MCP_REPO_DIR;
  const dir = typeof override === 'string' && override.trim().length > 0
    ? override.trim()
    : fileURLToPath(new URL('../../mothy-mcp/', import.meta.url));
  const base = dir.endsWith('/') ? dir : `${dir}/`;
  return `${base}lib/plugin-fleet-state.mjs`;
}

const CONTRACT = siblingContractPath();
const HAVE_SIBLING = existsSync(CONTRACT);
const SKIP_REASON = `sibling contract not present at ${CONTRACT} - set MOTHY_MCP_REPO_DIR to check parity`;

const GOOD_ID = '11111111-2222-4333-8444-555555555555';
const GOOD_VERSION = '0.26.6';
const GOOD_EMAIL = 'kevin@mothandflamevr.com';

/* One corpus, deliberately mixed. Values the client accepts AND values it does
 * not: the subset assertion is vacuous unless something sits on both sides. */
const EMAIL_CORPUS = [
  'kevin@mothandflamevr.com',
  'first.last@mothandflamevr.com',
  'rich+tag@mothandflamevr.com',
  'a_b-c@mothandflamevr.com',
  "o'brien@mothandflamevr.com",
  'KEVIN@MOTHANDFLAMEVR.COM',
  '  kevin@mothandflamevr.com  ',
  'a@b@mothandflamevr.com',
  '.rich@mothandflamevr.com',
  'rich.@mothandflamevr.com',
  'rich..h@mothandflamevr.com',
  'riçh@mothandflamevr.com',
  'ri(ch)@mothandflamevr.com',
  'ri:ch@mothandflamevr.com',
  'ri ch@mothandflamevr.com',
  'ri ch@mothandflamevr.com',
  'ri﻿ch@mothandflamevr.com',
  '@mothandflamevr.com',
  'rich@evil.com',
  'rich@notmothandflamevr.com',
  'rich@mail.mothandflamevr.com',
  `${'a'.repeat(300)}@mothandflamevr.com`,
];

const ID_CORPUS = [
  GOOD_ID,
  '11111111-2222-4333-b444-555555555555',
  '11111111-2222-4333-8444-55555555555',
  '11111111-2222-4333-8444-5555555555555',
  '11111111-2222-5333-8444-555555555555',
  '11111111-2222-4333-c444-555555555555',
  '11111111-2222-4333-8444-55555555555Z',
  '11111111222243338444555555555555',
  'plugin:hb:v1:a@b.com:11111111-2222-4333-8444-555555555555',
  '',
];

const VERSION_CORPUS = [
  '0.26.6', '1.0.0', '0.0.0', '10.20.30', '99999999999999.0.0',
  '1.0', '1.0.0.0', 'v1.0.0', '1.0.0-rc1', '', '1.0.0 ',
  '999999999999999999999.0.0',
];

/** What the CLIENT would put on the wire for this email, or null if it refuses. */
function clientAcceptsEmail(v) {
  if (!isInDomainEmail(v)) return null;
  const built = buildPayload({
    installId: GOOD_ID, claimedEmail: v, pluginVersion: GOOD_VERSION, freshnessState: 'unknown',
  });
  return built.ok ? built.payload.claimed_email : null;
}

function clientAcceptsId(v) {
  const built = buildPayload({
    installId: v, claimedEmail: GOOD_EMAIL, pluginVersion: GOOD_VERSION, freshnessState: 'unknown',
  });
  return built.ok ? built.payload.install_id : null;
}

function clientAcceptsVersion(v) {
  const built = buildPayload({
    installId: GOOD_ID, claimedEmail: GOOD_EMAIL, pluginVersion: v, freshnessState: 'unknown',
  });
  return built.ok ? built.payload.plugin_version : null;
}

test('P0 the sibling contract is present, or this file says out loud that it did not look', (t) => {
  if (!HAVE_SIBLING) {
    t.skip(SKIP_REASON);
    return;
  }
  assert.ok(existsSync(CONTRACT));
});

test('P1 every email the CLIENT will send, the SERVER stores - and keys on the same bytes', async (t) => {
  if (!HAVE_SIBLING) return t.skip(SKIP_REASON);
  const server = await import(CONTRACT);

  let accepted = 0;
  let refused = 0;
  for (const raw of EMAIL_CORPUS) {
    const ours = clientAcceptsEmail(raw);
    if (ours === null) { refused += 1; continue; }
    accepted += 1;
    const theirs = server.validateClaimedEmail(ours);
    assert.equal(theirs.ok, true,
      `client would send ${JSON.stringify(raw)} as ${JSON.stringify(ours)}; server refuses it (${theirs.reason})`);
    assert.equal(theirs.value, ours,
      'the value we send must be the value they key on - two spellings would be two machines');
  }

  assert.ok(accepted >= 5, `subset check is vacuous: client accepted only ${accepted} of the corpus`);
  assert.ok(refused >= 5, `corpus is too soft to prove anything: client refused only ${refused}`);
});

test('P2 every install_id the CLIENT will send, the SERVER stores', async (t) => {
  if (!HAVE_SIBLING) return t.skip(SKIP_REASON);
  const server = await import(CONTRACT);

  let accepted = 0;
  for (const raw of ID_CORPUS) {
    const ours = clientAcceptsId(raw);
    if (ours === null) continue;
    accepted += 1;
    const theirs = server.validateInstallId(ours);
    assert.equal(theirs.ok, true,
      `client would send install_id ${JSON.stringify(ours)}; server refuses it (${theirs.reason})`);
    assert.equal(theirs.value, ours);
  }
  assert.ok(accepted >= 2, `subset check is vacuous: client accepted only ${accepted} ids`);
});

test('P3 every plugin_version the CLIENT will send, the SERVER can compare', async (t) => {
  if (!HAVE_SIBLING) return t.skip(SKIP_REASON);
  const server = await import(CONTRACT);

  let accepted = 0;
  for (const raw of VERSION_CORPUS) {
    const ours = clientAcceptsVersion(raw);
    if (ours === null) continue;
    accepted += 1;
    assert.equal(server.isValidVersion(ours), true,
      `client would send plugin_version ${JSON.stringify(ours)}; server cannot compare it`);
    assert.doesNotThrow(() => server.compareVersions(ours, '0.0.0'),
      'a version the server cannot compare classifies as undetermined, i.e. the report goes blind');
  }
  assert.ok(accepted >= 4, `subset check is vacuous: client accepted only ${accepted} versions`);
});

test("P4 the caps and the freshness enum are the server's own numbers, not a second opinion", async (t) => {
  if (!HAVE_SIBLING) return t.skip(SKIP_REASON);
  const server = await import(CONTRACT);

  assert.equal(MAX_EMAIL_CHARS, server.MAX_EMAIL_LENGTH);
  assert.equal(MAX_VERSION_CHARS, server.MAX_VERSION_LENGTH);
  assert.deepEqual([...FRESHNESS_STATES].sort(), [...server.FRESHNESS_STATES].sort());
});
