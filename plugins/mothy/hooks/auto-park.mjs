#!/usr/bin/env node
// auto-park.mjs — the REASONING half of a park, written automatically.
//
// WHY THIS EXISTS. Parking only helps if someone remembers to ask for it, and
// the entire point of auto-compaction is that nobody has to watch for the right
// moment. So the reasoning capture cannot depend on a human saying the words.
//
// PreCompact receives `transcript_path`: the whole conversation, on disk, at
// the moment before it is summarized away. This reads a bounded tail of it and
// spends one cheap model call to write down what a summary reliably loses —
// what was decided and why, what was tried and rejected, what is still open,
// and what is believed but unverified.
//
// It writes its OWN file next to the snapshot, and never the snapshot itself.
// That is not tidiness — the snapshot opens with `>` (truncate), this appends,
// and NOTHING guarantees they do not overlap: the hooks are deliberately
// declared in two places (we do not know which one a given Claude Code version
// reads) and nothing documents that hooks in one matcher run sequentially. A
// live run on 2026-08-19 ended mid-word, `urvives.`, the stranded tail of this
// script's own note. Two writers, one file. Now: one writer each.
//
// ── The rules it must not break ────────────────────────────────────────────
//
// FAIL OPEN, ALWAYS. Exits 0 on every path. A compaction fires when context is
// full; anything that delays or blocks it stalls the session at exactly the
// moment it can least afford it.
//
// UNAVAILABLE IS NOT ABSENT. If the model call fails, times out, or returns
// junk, the section is written saying so. A missing section would read as
// "nothing was going on", which is the failure this whole feature exists to
// prevent.
//
// NO RECURSION. `claude -p` is itself Claude Code and would fire this hook
// again. The child is marked, and a marked process exits immediately.
//
// NO TOOLS. The child gets the transcript on stdin and is given no tools, so it
// cannot read files, run commands, or touch the repo. It writes prose or
// nothing.

import { readFileSync, writeFileSync, mkdirSync, statSync, openSync, readSync, closeSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RECURSION_MARK = 'MOTHY_AUTOPARK_CHILD';
const TAIL_BYTES = 4 * 1024 * 1024;   // how much of the transcript file to read
const MAX_PROMPT_CHARS = 40_000;      // what we are willing to pay to summarize
const TIMEOUT_MS = 90_000;
const MODEL = process.env.MOTHY_AUTOPARK_MODEL || 'fable';

const OFF_VALUES = new Set(['0', 'off', 'false', 'no']);

function main() {
  // Recursion guard FIRST — before any work at all.
  if (process.env[RECURSION_MARK]) return;

  const raw = String(process.env.MOTHY_AUTOPARK ?? '').trim().toLowerCase();
  if (OFF_VALUES.has(raw)) return;

  let hook = {};
  try { hook = JSON.parse(readStdin() || '{}'); } catch { hook = {}; }

  // Same ordering as the snapshot script, and the same refusal: never write
  // inside our own installation. See precompact-snapshot.sh for the measured
  // Desktop case that made this necessary.
  let root = process.env.CLAUDE_PROJECT_DIR || hook.cwd || process.cwd();
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (pluginRoot && resolve(root).startsWith(resolve(pluginRoot))) root = process.cwd();
  const out = join(root, '.claude', 'precompact-reasoning.md');
  const transcript = hook.transcript_path;

  if (!transcript) return note(out, 'UNAVAILABLE — the hook received no transcript path.');

  let convo, seen;
  try {
    const tail = readTail(transcript, TAIL_BYTES);
    seen = extractConversationDetailed(tail);
    convo = seen.text;
  } catch (e) {
    return note(out, `UNAVAILABLE — could not read the transcript (${short(e)}).`);
  }

  // A transcript with content but NOT ONE recognised message is a PARSER
  // FAILURE, not a quiet session — the shape is not what we expect, and every
  // future run will fail identically and silently. Reporting it as "nothing
  // much happened" is how a defect becomes permanent.
  if (seen.lines > 0 && seen.messages === 0) {
    return note(out, `UNAVAILABLE — read ${seen.lines} transcript lines and recognised `
      + '0 of them as messages. The transcript format is not what this hook expects.');
  }

  // Genuinely short. Not an error, and not silence either — and it now says
  // WHAT IT SAW, so a future reader can tell a quiet session from a blind one.
  if (convo.length < 400) {
    return note(out, `Not written — only ${convo.length} characters of conversation `
      + `(${seen.messages} of ${seen.lines} lines parsed as messages). Too little to summarize.`);
  }

  const clipped = convo.length > MAX_PROMPT_CHARS ? convo.slice(-MAX_PROMPT_CHARS) : convo;
  const truncated = clipped.length < convo.length;

  let text;
  try {
    text = askModel(clipped);
  } catch (e) {
    return note(out, `UNAVAILABLE — the summarizing model call failed (${short(e)}).`);
  }
  if (!text) return note(out, 'UNAVAILABLE — the summarizing model returned nothing.');

  const header = truncated
    ? `_Model-written from the last ${MAX_PROMPT_CHARS.toLocaleString()} characters of the conversation `
      + `(earlier turns not seen). Recovered after the fact — weaker than a deliberate park._`
    : '_Model-written from the conversation. Recovered after the fact — weaker than a deliberate park._';

  write(out, `\n## What was going on (auto-captured)\n\n${header}\n\n${text.trim()}\n`);
}

/** Read the LAST n bytes of a file without loading a 65 MB transcript. */
function readTail(path, n) {
  const size = statSync(path).size;
  const start = Math.max(0, size - n);
  const len = size - start;
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.allocUnsafe(len);
    readSync(fd, buf, 0, len, start);
    return buf.toString('utf8');
  } finally { closeSync(fd); }
}

/**
 * Pull the human/assistant PROSE out of the JSONL and drop everything else.
 *
 * Tool calls and their results are the overwhelming bulk of a transcript and
 * the least useful part here — a file listing does not explain a decision. The
 * first line is dropped unread because a byte-offset tail almost always lands
 * mid-line.
 */
export function extractConversation(jsonl) {
  return extractConversationDetailed(jsonl).text;
}

/**
 * As above, but also reports HOW MUCH it understood — `lines` considered and
 * `messages` recognised. The caller needs those to tell a short session from a
 * transcript it cannot read; both produce very little text.
 */
export function extractConversationDetailed(jsonl) {
  const lines = String(jsonl).split('\n').slice(1);
  const parts = [];
  let considered = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    considered += 1;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    const role = d.type;
    if (role !== 'user' && role !== 'assistant') continue;
    const content = d?.message?.content;
    let text = '';
    if (typeof content === 'string') text = content;
    else if (Array.isArray(content)) {
      text = content.filter((b) => b && b.type === 'text').map((b) => b.text || '').join('\n');
    }
    text = text.trim();
    if (!text) continue;
    // System-injected reminders are noise here and can be long.
    if (text.startsWith('<system-reminder>') || text.startsWith('<local-command')) continue;
    parts.push(`${role === 'user' ? 'USER' : 'ASSISTANT'}: ${text}`);
  }
  return { text: parts.join('\n\n'), messages: parts.length, lines: considered };
}

const PROMPT = `You are writing a handoff note that will be read AFTER this conversation is
compacted into a lossy summary. The summary will keep conclusions and drop the evidence and
reasoning under them; your job is to preserve exactly what it loses.

Write these sections, briefly, in markdown. Omit any section you have no real content for —
never pad, never invent, never restate the summary.

**Decided** — decisions made and the reason for each.
**Rejected** — approaches tried or considered and abandoned, and why. This is the most
valuable section: without it the next session re-explores them.
**Open** — what is unfinished, and what the next step was going to be.
**Unverified** — anything believed or asserted but not actually checked. Be specific.

Rules: no preamble, no sign-off. Under 400 words. If the conversation genuinely contains
none of this, output exactly: NOTHING SUBSTANTIVE TO RECORD.`;

/**
 * Find the `claude` binary.
 *
 * A hook does not inherit a login shell's PATH. On this machine `claude` lives
 * in ~/.npm-global/bin, so a bare spawnSync('claude') is ENOENT and the whole
 * feature fails open forever while looking like it merely had nothing to say.
 * Measured, not guessed: `env -i PATH=/usr/bin:/bin node auto-park.mjs` gave
 * "the summarizing model call failed (spawnSync claude ENOENT)".
 *
 * PATH is still tried FIRST — an explicitly-installed binary should win over
 * anything we hardcode. The list is a fallback, not an override.
 */
export function resolveClaudeBin(env = process.env, exists = existsSync) {
  const explicit = env.MOTHY_AUTOPARK_CLAUDE_BIN;
  if (explicit) return explicit;
  const home = env.HOME || '';
  for (const dir of String(env.PATH || '').split(':')) {
    if (dir && exists(join(dir, 'claude'))) return join(dir, 'claude');
  }
  const candidates = [
    `${home}/.npm-global/bin/claude`,
    `${home}/.local/bin/claude`,
    `${home}/.claude/local/claude`,
    `${home}/.bun/bin/claude`,
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];
  for (const c of candidates) if (home || !c.startsWith('/Users')) { if (exists(c)) return c; }
  // Nothing found. Return the bare name so the failure is the familiar ENOENT
  // rather than a new one — and so a PATH we failed to parse still gets a shot.
  return 'claude';
}

function askModel(convo) {
  const res = spawnSync(
    resolveClaudeBin(),
    ['-p', PROMPT, '--model', MODEL, '--allowed-tools', ''],
    {
      input: `<conversation>\n${convo}\n</conversation>`,
      encoding: 'utf8',
      timeout: TIMEOUT_MS,
      env: { ...process.env, [RECURSION_MARK]: '1' },
    },
  );
  if (res.error) throw res.error;
  if (res.status !== 0) {
    // The exit code alone is not diagnosable. Measured on Desktop: "exit 1"
    // with no other information, while the identical command run by hand
    // exited 0 — so the cause was environmental and the only artifact naming
    // it was the stderr this line used to discard. Bounded, single-line.
    const why = String(res.stderr || '').trim().replace(/\s+/g, ' ').slice(0, 300);
    throw new Error(why ? `exit ${res.status}: ${why}` : `exit ${res.status}, no stderr`);
  }
  const t = String(res.stdout || '').trim();
  if (!t || /^NOTHING SUBSTANTIVE TO RECORD/i.test(t)) return '';
  return t;
}

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}
function short(e) {
  // 400, not 120: the message now carries the child's stderr, and clipping it
  // to 120 would re-create the undiagnosable failure this exists to fix.
  return String((e && e.message) || e).slice(0, 400).replace(/\n/g, ' ');
}
/**
 * Replace, never append.
 *
 * Appending was right while this shared the snapshot's file and had to land
 * after it. Since 0.9.0 it owns its own file, and appending means a reader's
 * eye lands on the OLDEST section first — measured on 2026-08-19, a stale
 * "too little conversation" sitting above the run that actually mattered.
 */
function write(out, body) {
  // A project with no .claude/ yet would otherwise lose the note silently —
  // which is the exact failure this file exists to prevent, wearing a
  // filesystem costume.
  try { mkdirSync(dirname(out), { recursive: true }); } catch { /* fail open */ }
  try { writeFileSync(out, body); } catch { /* fail open */ }
}
function note(out, why) {
  write(out, `\n## What was going on (auto-captured)\n\n**${why}**\n\n`
    + 'This section not being here would have read as "nothing was happening". It is here, '
    + 'saying it could not be written, so that distinction survives.\n');
}

// Entrypoint guard — the pure helpers above are imported by tests, and running
// a compaction hook on import would be its own kind of surprise.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try { main(); } catch { /* fail open */ }
  process.exit(0);
}
