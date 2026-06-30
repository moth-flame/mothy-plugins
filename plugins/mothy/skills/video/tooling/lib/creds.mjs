// Credential resolver for the mothy video tooling.
//
// resolveCred(name, { stateFile }) returns a secret value resolved with a
// strict precedence and NEVER logs the value:
//
//   1. process.env[name]                       (env var wins)
//   2. $MOTHY_STATE_DIR/<file>                 (per-machine state dir)
//   3. ~/.mothy/.state/<file>                  (default state dir)
//
// File fallback is a JSON object that maps env-var names to values, e.g.
// { "VIMEO_ACCESS_TOKEN": "..." }. Each known credential name maps to a
// documented fallback file (vimeo-creds.json / zoho-creds.json / .env.local);
// callers may override the filename via { stateFile }.
//
// ElevenLabs keys are stored quoted in .env-style files, so surrounding
// double-quotes are stripped from any resolved value. A missing credential
// returns null (never throws) — corrupt/unreadable files are treated as
// absent so a bad fallback can't crash a capture run.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Map known credential names to their documented fallback file. Names not in
// this map fall back to "<NAME>.json" so an unknown cred still has a sane
// file to look in.
const FALLBACK_FILES = {
  ELEVENLABS_API_KEY: '.env.local',
  VIMEO_ACCESS_TOKEN: 'vimeo-creds.json',
  ZOHO_CLIENT_ID: 'zoho-creds.json',
  ZOHO_CLIENT_SECRET: 'zoho-creds.json',
  ZOHO_REFRESH_TOKEN: 'zoho-creds.json',
};

// Strip a single layer of surrounding matching double-quotes. ElevenLabs
// values in .env files are commonly written as KEY="...".
function stripQuotes(value) {
  if (typeof value !== 'string') return value;
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

// Read a JSON map from `path` and return map[name], or null on any problem
// (missing file, bad JSON, key absent). Never throws, never logs the value.
function readFromFile(path, name) {
  if (!path || !existsSync(path)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
  if (parsed && typeof parsed === 'object' && parsed[name] != null) {
    return parsed[name];
  }
  return null;
}

export function resolveCred(name, { stateFile } = {}) {
  if (!name) return null;

  // 1. Environment variable wins outright.
  const fromEnv = process.env[name];
  if (fromEnv != null && fromEnv !== '') {
    return stripQuotes(fromEnv);
  }

  // Resolve which fallback filename this credential lives in.
  const file = stateFile || FALLBACK_FILES[name] || `${name}.json`;

  // 2. $MOTHY_STATE_DIR/<file>
  const stateDir = process.env.MOTHY_STATE_DIR;
  if (stateDir) {
    const fromStateDir = readFromFile(join(stateDir, file), name);
    if (fromStateDir != null) return stripQuotes(fromStateDir);
  }

  // 3. ~/.mothy/.state/<file>
  const fromHome = readFromFile(
    join(homedir(), '.mothy', '.state', file),
    name,
  );
  if (fromHome != null) return stripQuotes(fromHome);

  // Absent everywhere — return null, never throw.
  return null;
}

export default resolveCred;
