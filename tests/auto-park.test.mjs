/**
 * auto-park.test.mjs — the automatic reasoning capture.
 *
 * The feature exists because nobody should have to remember to park; the whole
 * point of auto-compaction is not watching for the right moment. So this runs
 * unattended on every compaction, which makes its failure behaviour more
 * important than its success behaviour:
 *
 *   - it must NEVER delay or block a compaction (always exit 0)
 *   - it must NEVER silently produce nothing — "could not write this" and
 *     "nothing was happening" are different facts, and on a handoff note the
 *     second one is a lie the reader cannot detect
 *   - it must NEVER recurse: the summarizer is itself Claude Code, and would
 *     otherwise fire this hook again, forever
 *
 * The model is stubbed with a fake `claude` on PATH — a test that spends real
 * tokens is a test nobody runs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync, mkdtempSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractConversation } from '../plugins/mothy/hooks/auto-park.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'plugins', 'mothy', 'hooks', 'auto-park.mjs');

function jsonl(...rows) { return 'FIRST-LINE-ALWAYS-DROPPED\n' + rows.map((r) => JSON.stringify(r)).join('\n'); }
const say = (type, text) => ({ type, message: { content: [{ type: 'text', text }] } });

/** A project dir plus a fake `claude` binary that echoes a canned reply. */
function scaffold({ reply = 'Decided: shipped X.', exit = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'autopark-'));
  mkdirSync(join(dir, 'bin'));
  writeFileSync(join(dir, 'bin', 'claude'),
    `#!/bin/sh\ncat > /dev/null\n${exit === 0 ? `printf '%s' ${JSON.stringify(reply)}` : ''}\nexit ${exit}\n`);
  chmodSync(join(dir, 'bin', 'claude'), 0o755);
  return dir;
}

function run(dir, hookInput, extraEnv = {}) {
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(hookInput),
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, CLAUDE_PROJECT_DIR: dir, ...extraEnv },
  });
  const out = join(dir, '.claude', 'precompact-state.md');
  return existsSync(out) ? readFileSync(out, 'utf8') : '';
}

function transcriptIn(dir, body) {
  mkdirSync(join(dir, '.claude'), { recursive: true });
  const p = join(dir, 'transcript.jsonl');
  writeFileSync(p, body);
  return p;
}

const LONG = 'We debated two designs and picked the second because the first could not be rolled back. '.repeat(8);

test('extracts human/assistant prose and drops tool traffic', () => {
  const text = extractConversation(jsonl(
    say('user', 'why did we pick B?'),
    { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] } },
    { type: 'user', message: { content: [{ type: 'tool_result', content: 'a.txt\nb.txt' }] } },
    say('assistant', 'because A cannot be rolled back'),
  ));
  assert.match(text, /USER: why did we pick B\?/);
  assert.match(text, /ASSISTANT: because A cannot be rolled back/);
  assert.ok(!text.includes('a.txt'), 'tool output is bulk and explains nothing — it must be dropped');
  assert.ok(!text.includes('ls'), 'tool input must be dropped too');
});

test('drops the first line — a byte-offset tail lands mid-record', () => {
  const text = extractConversation('{"type":"user","mess\n' + JSON.stringify(say('user', 'intact line')));
  assert.equal(text, 'USER: intact line');
});

test('drops injected system reminders', () => {
  const text = extractConversation(jsonl(say('user', '<system-reminder>noise</system-reminder>'), say('user', 'real')));
  assert.equal(text, 'USER: real');
});

test('writes the captured section when the model answers', () => {
  const dir = scaffold({ reply: '**Decided** — picked B, A had no rollback.' });
  const out = run(dir, { transcript_path: transcriptIn(dir, jsonl(say('user', LONG))) });
  assert.match(out, /What was going on \(auto-captured\)/);
  assert.match(out, /picked B, A had no rollback/);
  assert.match(out, /weaker than a deliberate park/, 'must not present itself as equal to a real park');
});

test('a FAILED model call is recorded, not silently skipped', () => {
  const dir = scaffold({ exit: 1 });
  const out = run(dir, { transcript_path: transcriptIn(dir, jsonl(say('user', LONG))) });
  assert.match(out, /UNAVAILABLE/);
  assert.match(out, /would have read as "nothing was happening"/,
    'the file must explain why an absent section would have been a lie');
});

test('a missing transcript path is recorded, not silently skipped', () => {
  const dir = scaffold();
  assert.match(run(dir, {}), /UNAVAILABLE — the hook received no transcript path/);
});

test('an unreadable transcript is recorded, not silently skipped', () => {
  const dir = scaffold();
  assert.match(run(dir, { transcript_path: join(dir, 'nope.jsonl') }), /UNAVAILABLE — could not read/);
});

test('a trivial conversation says so rather than paying for a summary', () => {
  const dir = scaffold();
  const out = run(dir, { transcript_path: transcriptIn(dir, jsonl(say('user', 'hi'))) });
  assert.match(out, /too little conversation/);
});

test('RECURSION GUARD: a marked child does nothing at all', () => {
  const dir = scaffold();
  const out = run(dir, { transcript_path: transcriptIn(dir, jsonl(say('user', LONG))) }, { MOTHY_AUTOPARK_CHILD: '1' });
  assert.equal(out, '', 'the summarizer is itself Claude Code — an unmarked child would loop forever');
});

test('kill switch MOTHY_AUTOPARK=0 writes nothing', () => {
  const dir = scaffold();
  const out = run(dir, { transcript_path: transcriptIn(dir, jsonl(say('user', LONG))) }, { MOTHY_AUTOPARK: '0' });
  assert.equal(out, '');
});

test('exits 0 even when the model binary does not exist at all', () => {
  const dir = mkdtempSync(join(tmpdir(), 'autopark-nobin-'));
  const t = transcriptIn(dir, jsonl(say('user', LONG)));
  // No fake claude on PATH: spawn fails. Must still exit 0 and record the fact.
  // process.execPath, not 'node' — PATH is deliberately empty in this test.
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ transcript_path: t }),
    encoding: 'utf8',
    env: { ...process.env, PATH: '/nonexistent', CLAUDE_PROJECT_DIR: dir },
  });
  assert.match(readFileSync(join(dir, '.claude', 'precompact-state.md'), 'utf8'), /UNAVAILABLE/);
});

test('the summarizing child is given no tools', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  assert.match(src, /'--allowed-tools', ''/,
    'the child reads a transcript on stdin and writes prose — it must not be able to touch anything');
});
