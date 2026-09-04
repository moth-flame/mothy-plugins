#!/usr/bin/env node
/*
 * report-plugin-heartbeat.mjs — SessionStart. Report THIS plugin build's own
 * version, once a UTC day, to the fleet endpoint.
 *
 * WHY IT EXISTS, and why it is a separate file from check-plugin-freshness.mjs.
 * That hook ships INSIDE the plugin, so a DISABLED or uninstalled plugin can
 * never warn that it is disabled — it says so in its own header. Kevin ran
 * 0.1.1, disabled, for 2.5 months and no local guard could ever have spoken.
 * The only thing that makes absence visible is an outbound report, read
 * somewhere off the machine. Absence is the signal; there is deliberately no
 * `enabled` field, because a disabled plugin's hook does not run and the field
 * could therefore only ever say `true`.
 *
 * THIS REPO IS PUBLIC. Every constraint below follows from that one fact:
 *
 *   - NO SECRET SHIPS. The write is unauthenticated and the email is
 *     SELF-ASSERTED; the roster gate lives on the server. That is an ACCEPTED
 *     residual recorded in the ADR — nobody may later "fix" it by shipping a
 *     token into a public repo.
 *   - The URL is COMPILED IN and there is exactly ONE of it, https. It is NOT
 *     environment-overridable: an env-overridable URL is a compiled-in URL in
 *     name only, because a poisoned shell profile would then re-point that
 *     machine's payload at a host we never chose. This module reads exactly
 *     ONE environment variable, the kill switch, and no other.
 *   - The response body is NEVER read. A SessionStart hook's stdout lands in
 *     the model context of every session on ~47 machines; parsing a server
 *     reply would make this an injection channel into all of them.
 *   - TWO INDEPENDENT TIMING BOUNDS: AbortSignal.timeout(1500) here, and an
 *     explicit `timeout` on the hook wiring in both hooks.json and
 *     plugin.json. A single defence whose failure mode is "session hangs at
 *     start on 47 Macs" deserves two.
 *   - FAIL OPEN, ALWAYS EXIT 0. A telemetry report must never cost anyone a
 *     session.
 *
 * FOUR FIELDS, and the count is the point: install_id, claimed_email,
 * plugin_version, freshness_state. No cwd, no repo, no hostname, no session
 * id, no os, no timestamp of any kind. The server derives dates only.
 *
 * install_id is NOT "not a fingerprint". It is a pseudonymous per-machine
 * identifier bound to an identified person, supporting per-machine
 * observation at date granularity for 45 days, and the file survives an
 * uninstall. It exists because two Macs, one of them stale, is exactly the
 * Kevin shape. plugins/mothy/docs/telemetry.md tells a teammate which file to
 * delete.
 *
 * FRESHNESS IS NOT RECOMPUTED HERE. It is the SAME verdict the local nag
 * renders, imported from check-plugin-freshness.mjs, so the two hooks can
 * never disagree about whether this install is stale. One known divergence,
 * stated rather than hidden: the nag honors CLAUDE_CONFIG_DIR and this module
 * cannot, because it is pinned to exactly one environment variable. On a
 * machine with a relocated config dir the reported state degrades toward
 * `unknown`, never toward `current`.
 *
 * DELIVERY IS NOT "THE REQUEST REACHED SOMETHING". `classifyDeliveryStatus` is
 * a closed, default-deny mapping and the single authority for it: only a status
 * the server itself composes is anything other than `not_delivered`. The rule
 * it replaced was `status < 500`, which counted a platform 404 — the route not
 * being deployed yet — as a stored record, burning that machine's one daily
 * slot forever with nothing able to notice. An outcome we cannot read gives the
 * day BACK: this fails toward a retry, never toward a day of silence.
 *
 * THROTTLE FAILURE DIRECTION, stated because it is silent otherwise: an
 * unwritable stamp file means every session POSTs. That is bounded (one small
 * request per session start) and correct — a rate limiter that cannot write
 * must not turn into a suppressor. Two sessions starting in the same second on
 * one machine can also both claim the day; the server dedupes per
 * email+install_id+date.
 */
import { randomUUID } from 'node:crypto';
import {
  existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync, writeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  classifyPluginFreshness,
  readCachedVersions,
  readInstalledVersion,
  readMarketplaceUpstream,
} from './check-plugin-freshness.mjs';

/* The ONE compiled-in endpoint. Changing it is a code change, reviewed in a
 * public diff, on a repo whose write access is the control for ~47 machines. */
export const HEARTBEAT_URL = 'https://mothy-mcp.vercel.app/api/plugin-heartbeat';

export const KILL_SWITCH = 'MOTHY_PLUGIN_HEARTBEAT';
const OFF_VALUES = new Set(['0', 'off', 'false', 'no']);

export const FETCH_TIMEOUT_MS = 1500;

export const IN_DOMAIN = '@mothandflamevr.com';

/* A CLOSED enum. `disabled` is deliberately absent and must stay absent: a
 * hook that did not run cannot report that it did not run, so we can never
 * know that state from here. Unknown never collapses into current. */
export const FRESHNESS_STATES = Object.freeze(['current', 'stale', 'unknown']);

export const PAYLOAD_FIELDS = Object.freeze([
  'install_id',
  'claimed_email',
  'plugin_version',
  'freshness_state',
]);

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
/* Byte-identical to EMAIL_RE in mothy-mcp lib/plugin-fleet-state.mjs. ASCII
 * only, single '@', dotted domain; deliberately narrower than RFC 5322. */
const EMAIL_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
export const MAX_EMAIL_CHARS = 254;
export const MAX_VERSION_CHARS = 16;

const INSTALL_ID_FILE = '.mothy-plugin-install-id';
const DAILY_STAMP_FILE = '.mothy-plugin-heartbeat-day';
const FIRST_RUN_FILE = '.mothy-plugin-heartbeat-notice';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ── pure helpers ──────────────────────────────────────────────────────── */

export function isDisabled(raw) {
  return OFF_VALUES.has(String(raw ?? '').trim().toLowerCase());
}

/**
 * True when `value` is an address of OUR domain that the SERVER will also
 * accept. It is deliberately a SUBSET of `validateClaimedEmail` in mothy-mcp's
 * `lib/plugin-fleet-state.mjs`, never merely a suffix check.
 *
 * Why a copy at all: mothy-mcp is a separate, private package with its own
 * deploy, and this plugin is a public repo installed on ~47 machines — there is
 * no shared package to import. Why it must be a subset: a client that accepts
 * what the server refuses POSTs a 400 every day forever, its row is never
 * written, and the only thing that can say so is the fleet report noticing the
 * machine has gone silent. `tests/plugin-heartbeat-contract-parity.test.mjs`
 * proves the subset relation against the real server module when the sibling
 * checkout is present.
 *
 * ASCII-only, single '@', no ':' (a Redis key segment separator server-side),
 * no control character or whitespace of any kind — `\s` is what catches NBSP
 * and the zero-width no-break space, which a naive ' ' check does not.
 */
export function isInDomainEmail(value) {
  if (typeof value !== 'string') return false;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > MAX_EMAIL_CHARS) return false;
  if (email.includes(':')) return false;
  if (/\s/.test(email)) return false;
  for (let i = 0; i < email.length; i += 1) {
    const code = email.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }
  if (!email.endsWith(IN_DOMAIN)) return false;
  return EMAIL_RE.test(email);
}

export function normalizeFreshnessState(value) {
  return FRESHNESS_STATES.includes(value) ? value : 'unknown';
}

/**
 * Build the wire record, or refuse. A PARTIAL heartbeat is worse than none:
 * it lands as a live row for a person whose version we could not read, which
 * reads downstream as "reporting and current".
 */
export function buildPayload({ installId, claimedEmail, pluginVersion, freshnessState } = {}) {
  if (typeof installId !== 'string' || !UUID_V4_RE.test(installId)) {
    return { ok: false, reason: 'bad_install_id' };
  }
  if (typeof claimedEmail !== 'string' || claimedEmail.length > MAX_EMAIL_CHARS
      || !isInDomainEmail(claimedEmail)) {
    return { ok: false, reason: 'bad_claimed_email' };
  }
  if (typeof pluginVersion !== 'string' || pluginVersion.length > MAX_VERSION_CHARS
      || !SEMVER_RE.test(pluginVersion)) {
    return { ok: false, reason: 'bad_plugin_version' };
  }
  return {
    ok: true,
    payload: {
      install_id: installId,
      claimed_email: claimedEmail.trim().toLowerCase(),
      plugin_version: pluginVersion,
      freshness_state: normalizeFreshnessState(freshnessState),
    },
  };
}

/**
 * The whole send/do-not-send decision, pure over observations. Every refusal
 * carries a REASON — "we sent nothing" and "we sent nothing because we could
 * not read an email" are different facts.
 */
export function decideHeartbeat({ disabled, email, pluginVersion, installId, throttled } = {}) {
  if (disabled) return { send: false, reason: 'disabled' };
  if (typeof email !== 'string' || email.trim() === '') return { send: false, reason: 'no_email' };
  if (!isInDomainEmail(email)) return { send: false, reason: 'email_out_of_domain' };
  if (typeof pluginVersion !== 'string' || !SEMVER_RE.test(pluginVersion)) {
    return { send: false, reason: 'no_plugin_version' };
  }
  if (typeof installId !== 'string' || !UUID_V4_RE.test(installId)) {
    return { send: false, reason: 'no_install_id' };
  }
  if (throttled) return { send: false, reason: 'throttled' };
  return { send: true, reason: 'send' };
}

/**
 * The ONLY consent surface. The team announcement was declined, so this
 * terminal notice is where a teammate learns what leaves their machine. An
 * unexplained "we are POSTing your email" line is exactly what makes a
 * skeptical person set the kill switch — which makes them invisible — so it
 * states the facts, the NOT list, the retention, the reader, and the off
 * switch, in six lines.
 */
export function renderFirstRunNotice() {
  return [
    'mothy: this plugin now reports its own version once a day, so a stale or disabled install is visible to us.',
    '  Sent: your @mothandflamevr.com email, the plugin version, a random install id, and its freshness state.',
    '  NOT sent: cwd, repo, hostname, session content, time of day, or anything you or Claude type.',
    '  Kept 45 days as a UTC date only. Read by Moth+Flame admins, and by you for your own row.',
    '  Turn it off any time:  export MOTHY_PLUGIN_HEARTBEAT=0',
    '  What is stored, and how to delete the id file: plugins/mothy/docs/telemetry.md',
  ].join('\n');
}

/* ── impure collectors ─────────────────────────────────────────────────── */

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
 * The account email the CLI itself signed in with. Read from ~/.claude.json,
 * ONE key deep, and nothing else in that file is touched — it is a config file
 * carrying unrelated state and this module has no business anywhere else in it.
 */
export function readAccountEmail(home) {
  const doc = readJson(join(home, '.claude.json'));
  const raw = doc && typeof doc === 'object' ? doc.oauthAccount?.emailAddress : null;
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return email === '' ? null : email;
}

/**
 * The version of the build that is EXECUTING, read from its own manifest
 * beside this file — never from ~/.claude/plugins/installed_plugins.json.
 * That index can hold several entries for one plugin and answering from it
 * would report a version this session is not running.
 */
export function readRunningPluginVersion() {
  const manifest = readJson(join(HERE, '..', '.claude-plugin', 'plugin.json'));
  const version = manifest && typeof manifest.version === 'string' ? manifest.version.trim() : null;
  return version && SEMVER_RE.test(version) ? version : null;
}

/**
 * Mint once, then reuse forever. Returns NULL when it cannot be persisted —
 * an ephemeral id per session would mint a fresh row every start and flood the
 * store, which is why the caller refuses to send without one.
 */
export function ensureInstallId(home) {
  const dir = join(home, '.claude');
  const path = join(dir, INSTALL_ID_FILE);

  try {
    const existing = readFileSync(path, 'utf8').trim();
    if (UUID_V4_RE.test(existing)) return existing;
  } catch {
    /* absent or unreadable — fall through and mint */
  }

  const minted = randomUUID();
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, `${minted}\n`);
  } catch {
    return null;
  }
  /* The write's exit is not the verdict — re-read it. A write that silently
   * did not land would hand back an id that the next session does not share. */
  try {
    return readFileSync(path, 'utf8').trim() === minted ? minted : null;
  } catch {
    return null;
  }
}

function utcDate(nowMs) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * Claim today's single send slot. TRUE means "you may send".
 *
 * A stamp we cannot WRITE returns TRUE, deliberately: failing to rate-limit
 * must never turn into failing to report. That direction is documented in the
 * module header and in telemetry.md rather than left to be discovered.
 */
export function claimDailySlot(home, nowMs = Date.now()) {
  const dir = join(home, '.claude');
  const path = join(dir, DAILY_STAMP_FILE);
  const today = utcDate(nowMs);

  try {
    if (readFileSync(path, 'utf8').trim() === today) return false;
  } catch {
    /* no stamp yet, or unreadable — treat as unclaimed */
  }

  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, `${today}\n`);
  } catch {
    return true; // cannot rate-limit => must not suppress
  }
  return true;
}

/**
 * Give the slot back. A cooldown is stamped only on CONFIRMED delivery; a
 * heartbeat nobody received must not arm a day of silence.
 */
export function releaseDailySlot(home) {
  try {
    rmSync(join(home, '.claude', DAILY_STAMP_FILE), { force: true });
  } catch {
    /* nothing to give back */
  }
}

function firstRunNoticeOwed(home) {
  return !existsSync(join(home, '.claude', FIRST_RUN_FILE));
}

function markFirstRunNoticeShown(home) {
  const dir = join(home, '.claude');
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, FIRST_RUN_FILE), `${utcDate(Date.now())}\n`);
  } catch {
    /* unshown-marker failure repeats the notice; noisy, never silent */
  }
}

/* The record is on the server. */
export const DELIVERY_DELIVERED = 'delivered';
/* The server READ these bytes and composed a refusal. Retrying the identical
 * record today would be refused identically, so the day's slot stays claimed —
 * and the machine then shows as SILENT in the fleet report, which pages. That
 * is the loud direction and it is the point: a client/server grammar drift is
 * visible off the machine even though nothing local can say so. */
export const DELIVERY_REJECTED = 'rejected';
/* Nothing was stored, and nothing about our bytes was decided. */
export const DELIVERY_NOT_DELIVERED = 'not_delivered';

/**
 * THE single authority for what a reply status means. A CLOSED, default-deny
 * mapping: only a status the server itself composes is anything but
 * `not_delivered`.
 *
 * The rule this REPLACED was `status < 500`, i.e. "the request reached
 * something" read as "the record was stored". That is UNKNOWN rendered as a
 * confident value, and it has a concrete cost: the server
 * (mothy-mcp `api/plugin-heartbeat.mjs`) emits exactly 202 / 400 / 405 and NEVER
 * a 404 — a 404 comes from the platform and means the route is not deployed,
 * which is precisely the state of the world on the day a plugin release lands
 * ahead of the server one. Counting that as delivery burns the machine's single
 * daily slot and loses the report, every day, per machine, with nothing
 * anywhere able to notice.
 *
 * 405 is a status the server does compose, but only for a non-POST — and this
 * module only ever sends POST, so a 405 means something between us rewrote the
 * request. That is not a verdict on our record either.
 */
export function classifyDeliveryStatus(status) {
  if (typeof status !== 'number' || !Number.isInteger(status)) return DELIVERY_NOT_DELIVERED;
  if (status >= 200 && status <= 299) return DELIVERY_DELIVERED;
  if (status === 400) return DELIVERY_REJECTED;
  return DELIVERY_NOT_DELIVERED;
}

/**
 * Give the day back unless the record was stored or positively refused.
 *
 * Written as "not one of the two keep-states" rather than "is not_delivered" on
 * purpose: an outcome this function cannot read fails toward RETRY, never
 * toward a day of silence.
 */
export function shouldReleaseSlotAfterPost(outcome) {
  return outcome !== DELIVERY_DELIVERED && outcome !== DELIVERY_REJECTED;
}

/**
 * ONE POST. The reply's STATUS is the only thing read — never its body — and
 * `classifyDeliveryStatus` is the only thing that interprets it.
 */
export async function postHeartbeat(payload, { fetchImpl } = {}) {
  const send = typeof fetchImpl === 'function' ? fetchImpl : fetch;
  try {
    const res = await send(HEARTBEAT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return classifyDeliveryStatus(res ? res.status : null);
  } catch {
    return DELIVERY_NOT_DELIVERED;
  }
}

/* ── entrypoint ────────────────────────────────────────────────────────── */

function say(text) {
  if (!text) return false;
  try {
    writeSync(1, `${text}\n`);
    return true;
  } catch {
    return false;
  }
}

function readFreshnessState(home) {
  try {
    const claudeHome = join(home, '.claude');
    const installed = readInstalledVersion(claudeHome, process.cwd());
    const verdict = classifyPluginFreshness({
      installedVersion: installed.version,
      cachedVersions: readCachedVersions(claudeHome),
      installedReason: installed.reason,
      upstream: readMarketplaceUpstream(claudeHome, Date.now()),
    });
    return normalizeFreshnessState(verdict.state);
  } catch {
    return 'unknown';
  }
}

async function main() {
  const disabled = isDisabled(process.env[KILL_SWITCH]);
  if (disabled) return;

  const home = homedir();
  const email = readAccountEmail(home);
  /* Refuse before minting anything. The plugin is public; a stranger who
   * installs it must leave no trace on our side and none on their disk. */
  if (!email || !isInDomainEmail(email)) return;

  const pluginVersion = readRunningPluginVersion();
  const installId = ensureInstallId(home);
  const throttled = !claimDailySlot(home);

  const decision = decideHeartbeat({ disabled, email, pluginVersion, installId, throttled });
  if (!decision.send) {
    if (decision.reason !== 'throttled') releaseDailySlot(home);
    return;
  }

  const built = buildPayload({
    installId,
    claimedEmail: email,
    pluginVersion,
    freshnessState: readFreshnessState(home),
  });
  if (!built.ok) {
    releaseDailySlot(home);
    return;
  }

  if (firstRunNoticeOwed(home) && say(renderFirstRunNotice())) markFirstRunNoticeShown(home);

  if (shouldReleaseSlotAfterPost(await postHeartbeat(built.payload))) releaseDailySlot(home);
}

if (process.argv[1] && canonicalPath(process.argv[1]) === canonicalPath(fileURLToPath(import.meta.url))) {
  main()
    .catch(() => { /* fail open — telemetry never costs a session */ })
    .finally(() => process.exit(0));
}
