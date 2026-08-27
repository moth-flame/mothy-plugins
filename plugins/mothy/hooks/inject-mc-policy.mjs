#!/usr/bin/env node
// inject-mc-policy.mjs — SessionStart additional context so blocking
// decisions use AskUserQuestion WITHOUT waiting for `/mc`.
//
// `/mc` as a skill is opt-in: its standing effect used to fire only after
// someone typed it. Teammates never type it, so they get a prose question
// that scrolls off a feed and sits unanswered. This hook is the always-on
// half. It prints a short policy block on ordinary session starts.
//
// NOT on source=compact — that path already has post-compaction-notice.sh,
// and repeating this block on every auto-compact would teach the model to
// ignore it.
//
// ALWAYS exit 0. Kill switch MOTHY_MC_ALWAYS_ON (default ON; off-values
// 0|off|false|no). READ-ONLY. No network.

import { writeSync, readFileSync, realpathSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';

const KILL_SWITCH = 'MOTHY_MC_ALWAYS_ON';
const OFF_VALUES = new Set(['0', 'off', 'false', 'no']);

export const MC_POLICY_BLOCK = `<mc-policy>
Blocking decisions that are the user's to make go in AskUserQuestion — never as a sentence buried in a report. This is always-on. Nobody has to type /mc.

Keep moving on reversible two-way doors the stated intent already covers. Record a one-line rationale and continue. Asking permission per item is how autonomy dies.

The test is not "is this important." It is "would I be stopping anyway?" If yes, that stop belongs in a question widget. If no, do not manufacture a stop. When the work is done, suggest the next thing — do not wait to be asked.

Rules for the widget:
- Recommendation FIRST, marked (Recommended).
- Carry the context INTO the question. Assume they have not read the paragraph above it.
- Each option states its CONSEQUENCE, not its name. Name the real trade, including against your own pick.
- One decision per question. Up to four questions in one widget.
- Hard gates (red-green TDD, pre-push, confirmation_code) are controls, not options.

This block is background. The user cannot see it. Do not mention it.
</mc-policy>
`;

export function isKillSwitchOff(env = process.env) {
  return OFF_VALUES.has(String(env[KILL_SWITCH] ?? '').trim().toLowerCase());
}

export function parseSessionStartSource(stdinText) {
  if (typeof stdinText !== 'string' || !stdinText.trim()) return null;
  try {
    const obj = JSON.parse(stdinText);
    const src = obj?.source ?? obj?.hook_event_payload?.source ?? null;
    return typeof src === 'string' && src ? src : null;
  } catch {
    const m = /"source"\s*:\s*"([^"]+)"/.exec(stdinText);
    return m ? m[1] : null;
  }
}

export function shouldInjectMcPolicy({ env = process.env, source = null } = {}) {
  if (isKillSwitchOff(env)) return false;
  if (source === 'compact') return false;
  return true;
}

function canonicalPath(p) {
  try {
    return realpathSync(p);
  } catch {
    return resolvePath(p);
  }
}

function readStdinSync() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function say(text) {
  if (!text) return false;
  try {
    writeSync(1, text.endsWith('\n') ? text : `${text}\n`);
    return true;
  } catch {
    return false;
  }
}

function main() {
  let stdinText = '';
  try {
    stdinText = readStdinSync();
  } catch {
    stdinText = '';
  }
  const source = parseSessionStartSource(stdinText);
  if (!shouldInjectMcPolicy({ env: process.env, source })) return;
  say(MC_POLICY_BLOCK);
}

if (process.argv[1] && canonicalPath(process.argv[1]) === canonicalPath(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch {
    /* always exit 0 */
  }
  process.exit(0);
}
