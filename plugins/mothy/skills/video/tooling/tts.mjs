// source: commandiq-dev2/scripts/demo/tts.mjs
// vendored 2026-06-29; canonical source is commandiq-dev2/scripts/demo
/**
 * tts.mjs — ElevenLabs voiceover generator for the CommandMRO demo video.
 *
 * Uses the ElevenLabs REST API: header is `xi-api-key`. The key is resolved
 * env-var-first so this is repo-agnostic when vendored into the plugin:
 *   1. process.env.ELEVENLABS_API_KEY (or ELEVEN_API_KEY)  — preferred
 *   2. $MOTHY_STATE_DIR/.env.local                          — documented fallback
 *   3. ~/.mothy/.state/.env.local                           — documented fallback
 * Surrounding quotes are stripped from the resolved key.
 *
 * Module API (importable):
 *   listVoices()                         -> [{ name, voice_id }]
 *   tts(text, voiceId, outMp3, opts)     -> writes mp3, returns outMp3
 *
 * CLI:
 *   node tts.mjs --voice <voiceId> --out <dir> [--script <vo-script.json>]
 *     Reads vo-script.json (alongside this file by default), renders one mp3
 *     per beat into <dir>, and writes <dir>/durations.json mapping
 *     beat_id -> seconds (via ffprobe).
 *
 *   node tts.mjs --voices
 *     Lists available voices (name + id) so you can pick one.
 *
 * Cost note: rendering all beats burns real API budget — only the CLI render
 * does that, and only for the beats in vo-script.json. Importing the module
 * costs nothing.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FFPROBE = process.env.FFPROBE_BIN || '/usr/local/bin/ffprobe';
const EL_BASE = 'https://api.elevenlabs.io';

/** Strip a single layer of surrounding single/double quotes. */
function stripQuotes(s) {
  const v = String(s).trim();
  if (v.length >= 2 && ((v[0] === '"' && v[v.length - 1] === '"') || (v[0] === "'" && v[v.length - 1] === "'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/** Best-effort parse of KEY=VALUE lines out of a .env.local file. */
function readEnvFileKey(file, names) {
  if (!file || !existsSync(file)) return '';
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return '';
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    if (names.includes(m[1])) {
      const val = stripQuotes(m[2]);
      if (val) return val;
    }
  }
  return '';
}

/**
 * Resolve the ElevenLabs API key, env-var-first, then documented fallbacks
 * under $MOTHY_STATE_DIR and ~/.mothy/.state. Surrounding quotes stripped.
 */
function apiKey() {
  const NAMES = ['ELEVENLABS_API_KEY', 'ELEVEN_API_KEY'];

  // 1. Environment variable (preferred).
  for (const n of NAMES) {
    if (process.env[n]) {
      const v = stripQuotes(process.env[n]);
      if (v) return v;
    }
  }

  // 2 + 3. Documented fallback files.
  const stateDir = process.env.MOTHY_STATE_DIR || path.join(os.homedir(), '.mothy', '.state');
  const fallbackFiles = [
    path.join(stateDir, '.env.local'),
    path.join(os.homedir(), '.mothy', '.state', '.env.local'),
  ];
  for (const f of fallbackFiles) {
    const v = readEnvFileKey(f, NAMES);
    if (v) return v;
  }

  throw new Error(
    'ELEVENLABS_API_KEY not set. Provide it via the ELEVENLABS_API_KEY env var, ' +
      'or place it in $MOTHY_STATE_DIR/.env.local (fallback ~/.mothy/.state/.env.local).',
  );
}

/** GET /v1/voices -> [{ name, voice_id }] */
export async function listVoices() {
  const res = await fetch(`${EL_BASE}/v1/voices`, {
    headers: { 'xi-api-key': apiKey() },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs GET /v1/voices ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.voices || []).map((v) => ({ name: v.name, voice_id: v.voice_id }));
}

/**
 * tts(text, voiceId, outMp3, { model })
 * POST /v1/text-to-speech/{voiceId}?output_format=mp3_44100_128
 * with the locked voice_settings, writes the returned mp3 to disk.
 */
export async function tts(text, voiceId, outMp3, opts = {}) {
  const model = opts.model || 'eleven_multilingual_v2';
  const url = `${EL_BASE}/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey(),
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0.3,
        use_speaker_boost: true,
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs TTS ${res.status}: ${detail.slice(0, 400)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(path.dirname(outMp3), { recursive: true });
  await writeFile(outMp3, buf);
  return outMp3;
}

/** ffprobe duration in seconds. */
function probeDuration(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFPROBE, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      file,
    ]);
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.on('error', reject);
    child.on('close', () => resolve(parseFloat(out.trim()) || 0));
  });
}

// ---- CLI --------------------------------------------------------------------

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--voice') args.voice = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--voices') args.listVoices = true;
    else if (a === '--script') args.script = argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.listVoices) {
    const voices = await listVoices();
    for (const v of voices) console.log(`${v.voice_id}\t${v.name}`);
    return;
  }

  if (!args.voice || !args.out) {
    console.error('usage: node tts.mjs --voice <voiceId> --out <dir>');
    console.error('       node tts.mjs --voices');
    process.exit(1);
  }

  const scriptPath = args.script || path.join(__dirname, 'vo-script.json');
  const script = JSON.parse(await readFile(scriptPath, 'utf8'));
  const beats = script.beats || [];
  const outDir = path.resolve(args.out);
  await mkdir(outDir, { recursive: true });

  const durations = {};
  for (const beat of beats) {
    const outMp3 = path.join(outDir, `beat-${beat.beat_id}.mp3`);
    process.stdout.write(`rendering beat ${beat.beat_id} (${beat.surface})... `);
    await tts(beat.text, args.voice, outMp3);
    const sec = await probeDuration(outMp3);
    durations[beat.beat_id] = sec;
    console.log(`${sec.toFixed(1)}s -> ${path.basename(outMp3)}`);
  }

  const manifest = path.join(outDir, 'durations.json');
  await writeFile(manifest, JSON.stringify(durations, null, 2) + '\n', 'utf8');
  console.log(`durations manifest -> ${manifest}`);
}

// Run only when invoked directly, not when imported.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}

export default { listVoices, tts };
