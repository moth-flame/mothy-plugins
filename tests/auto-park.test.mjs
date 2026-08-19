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
  // auto-park owns this file. It is NOT the snapshot's — see the two
  // regression tests at the bottom for why that separation is load-bearing.
  const out = join(dir, '.claude', 'precompact-reasoning.md');
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
  // No claude anywhere: spawn fails. Must still exit 0 and record the fact.
  // process.execPath, not 'node' — PATH is deliberately empty in this test.
  //
  // HOME is redirected too. Without that, resolveClaudeBin correctly finds the
  // REAL ~/.npm-global/bin/claude and the test spends four seconds calling the
  // actual model — a hermeticity break the PATH-only version could not have,
  // and a live reminder that the fallback list works.
  execFileSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ transcript_path: t }),
    encoding: 'utf8',
    env: { ...process.env, PATH: '/nonexistent', HOME: dir, CLAUDE_PROJECT_DIR: dir },
  });
  assert.match(readFileSync(join(dir, '.claude', 'precompact-reasoning.md'), 'utf8'), /UNAVAILABLE/);
});

test('the summarizing child is given no tools', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  assert.match(src, /'--allowed-tools', ''/,
    'the child reads a transcript on stdin and writes prose — it must not be able to touch anything');
});

// ── Two defects found by a real Claude Code run, 2026-08-19 ─────────────────
//
// Rich ran a live session, said a recall word, and compacted. The file ended:
//
//     (unavailable)
//     ```
//     urvives.
//
// `urvives.` is the tail of THIS script's UNAVAILABLE note ("...so that
// distinction survives."), stranded past the end of a shorter write. Two
// separate bugs, each independently fatal to the feature.

// DEFECT 1 — the shared file. This script appends to the same path the
// snapshot script opens with `>`. Whether the two overlap depends on things
// we do not control and partly do not want to control: the hooks are declared
// in BOTH hooks/hooks.json and plugin.json on purpose (we do not know which
// one a given Claude Code version reads), and nothing documents that hooks in
// one matcher run sequentially rather than in parallel.
//
// So the ordering assumption was never ours to make. Own a separate file
// instead: then a duplicate registration costs a duplicate section, which is
// ugly and harmless, rather than a silently half-erased one.
test('writes its own file, never the one the snapshot truncates', () => {
  const dir = scaffold();
  const shared = join(dir, '.claude', 'precompact-state.md');
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(shared, '# Pre-compaction snapshot\nMECHANICAL FACTS ONLY\n');
  const before = readFileSync(shared, 'utf8');

  run(dir, { transcript_path: transcriptIn(dir, jsonl(say('user', LONG), say('assistant', LONG))), cwd: dir, hook_event_name: 'PreCompact' });

  assert.equal(readFileSync(shared, 'utf8'), before,
    'auto-park must not touch the snapshot file — a concurrent `>` there erases us mid-write');
  const own = join(dir, '.claude', 'precompact-reasoning.md');
  assert.ok(existsSync(own), 'auto-park owns .claude/precompact-reasoning.md');
  assert.match(readFileSync(own, 'utf8'), /auto-captured/);
});

// DEFECT 2 — `claude` is not on a hook's PATH. Reproduced exactly against the
// shipped script:
//
//   env -i PATH=/usr/bin:/bin node auto-park.mjs < hook.json
//   -> "UNAVAILABLE — the summarizing model call failed (spawnSync claude ENOENT)"
//
// which is the note whose tail survived in the real file. On this machine
// `claude` lives in ~/.npm-global/bin; a hook does not inherit a login shell's
// PATH, so the model call had never once succeeded outside a test.
//
// Every existing test in this file scaffolds a fake `claude` and puts its dir
// on PATH — which is exactly how a suite stays green over a feature that
// cannot work. This one withholds PATH on purpose.
test('finds claude when PATH does not include it', () => {
  const dir = scaffold();
  run(dir, { transcript_path: transcriptIn(dir, jsonl(say('user', LONG), say('assistant', LONG))), cwd: dir, hook_event_name: 'PreCompact' },
    { PATH: '/usr/bin:/bin', MOTHY_AUTOPARK_CLAUDE_BIN: join(dir, 'bin', 'claude') });

  const out = readFileSync(join(dir, '.claude', 'precompact-reasoning.md'), 'utf8');
  assert.ok(!/ENOENT/.test(out), `still could not launch claude:\n${out}`);
  assert.match(out, /Decided/);
});
