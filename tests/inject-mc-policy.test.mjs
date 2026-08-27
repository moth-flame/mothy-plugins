/**
 * inject-mc-policy.test.mjs — always-on AskUserQuestion policy at SessionStart.
 *
 * `/mc` as a skill was opt-in. Teammates never type it, so blocking questions
 * landed as prose that scrolls off a feed. This hook prints the policy on
 * ordinary session starts. Compact starts skip it. Kill switch default ON.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isKillSwitchOff,
  parseSessionStartSource,
  shouldInjectMcPolicy,
  MC_POLICY_BLOCK,
} from '../plugins/mothy/hooks/inject-mc-policy.mjs';
import { readBothHookEventMaps } from './hook-wiring.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS = join(ROOT, 'plugins', 'mothy', 'hooks');
const SCRIPT = join(HOOKS, 'inject-mc-policy.mjs');

function run({ env = {}, stdin = { source: 'startup' } } = {}) {
  const res = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(stdin),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  assert.equal(res.status, 0, `hook must always exit 0 (stderr: ${res.stderr})`);
  return String(res.stdout || '');
}

test('kill switch: each off-value is silent; unset injects', () => {
  for (const off of ['0', 'off', 'false', 'no']) {
    assert.equal(isKillSwitchOff({ MOTHY_MC_ALWAYS_ON: off }), true);
    const out = run({ env: { MOTHY_MC_ALWAYS_ON: off } });
    assert.equal(out.trim(), '', `off-value "${off}" must produce no output`);
  }
  assert.equal(isKillSwitchOff({}), false);
  const on = run({});
  assert.match(on, /AskUserQuestion/);
  assert.match(on, /would I be stopping anyway/);
  assert.match(on, /do not manufacture a stop/);
});

test('source=compact is silent; startup and resume inject', () => {
  assert.equal(parseSessionStartSource('{"source":"compact"}'), 'compact');
  assert.equal(shouldInjectMcPolicy({ source: 'compact' }), false);
  assert.equal(run({ stdin: { source: 'compact' } }).trim(), '');

  assert.equal(shouldInjectMcPolicy({ source: 'startup' }), true);
  assert.match(run({ stdin: { source: 'startup' } }), /AskUserQuestion/);
  assert.match(run({ stdin: { source: 'resume' } }), /AskUserQuestion/);
  assert.match(run({ stdin: {} }), /AskUserQuestion/, 'missing source still injects');
});

test('policy block names the widget, the two-way-door rule, and (Recommended)', () => {
  assert.match(MC_POLICY_BLOCK, /AskUserQuestion/);
  assert.match(MC_POLICY_BLOCK, /\(Recommended\)/);
  assert.match(MC_POLICY_BLOCK, /two-way doors/);
  assert.doesNotMatch(MC_POLICY_BLOCK, /\b\/mc\b.*opt-in/i);
});

test('WIRING: inject-mc-policy.mjs is on SessionStart in BOTH hook files', () => {
  const { fromFile, fromPlugin } = readBothHookEventMaps();
  for (const src of [fromFile, fromPlugin]) {
    const s = JSON.stringify(src.SessionStart);
    assert.match(s, /inject-mc-policy\.mjs/);
    assert.match(s, /CLAUDE_PLUGIN_ROOT/);
    assert.match(s, /\|\| true/);
  }
});

test('WIRING: CLAUDE.md documents the hook and its kill switch', () => {
  const claudeMd = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
  assert.match(claudeMd, /inject-mc-policy/);
  assert.match(claudeMd, /MOTHY_MC_ALWAYS_ON/);
});

test('source-level: READ-ONLY, no network, fail-open wiring in the file', () => {
  const src = readFileSync(SCRIPT, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /\bwriteFileSync\b|\bmkdirSync\b|\bappendFileSync\b/);
  assert.doesNotMatch(src, /\bfetch\b|\bhttps?:\/\//);
  assert.match(readFileSync(SCRIPT, 'utf8'), /ALWAYS exit 0/);
});

test('mc skill standing effect is always-on, not "once invoked"', () => {
  const md = readFileSync(join(ROOT, 'plugins', 'mothy', 'skills', 'mc', 'SKILL.md'), 'utf8');
  assert.match(md, /Always-on/);
  assert.doesNotMatch(md, /Once `\/mc` has been invoked/);
});
