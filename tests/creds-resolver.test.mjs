// Red-green tests for the credential resolver.
//
// resolveCred(name, {stateFile}) resolves a secret by name with a strict
// precedence: process.env -> $MOTHY_STATE_DIR/<file> -> ~/.mothy/.state/<file>.
// File fallback is a JSON map. ElevenLabs values are stored quoted in
// .env-style files, so surrounding double-quotes are stripped. A missing
// cred returns null/undefined (never throws), and the value is NEVER logged.
//
// Run: node --test tests/

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveCred } from '../plugins/mothy/skills/video/tooling/lib/creds.mjs';

// Snapshot env so each test starts clean and we can restore after.
const ENV_KEYS = [
  'ELEVENLABS_API_KEY',
  'VIMEO_ACCESS_TOKEN',
  'ZOHO_CLIENT_ID',
  'MOTHY_STATE_DIR',
  'HOME',
];

let saved;
let stateDir;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  stateDir = mkdtempSync(join(tmpdir(), 'mothy-state-'));
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  if (stateDir) rmSync(stateDir, { recursive: true, force: true });
});

test('returns the env var value when set', () => {
  process.env.ELEVENLABS_API_KEY = 'sk_env_value';
  assert.equal(resolveCred('ELEVENLABS_API_KEY'), 'sk_env_value');
});

test('precedence: env var beats $MOTHY_STATE_DIR file beats ~/.mothy/.state file', () => {
  // Lay down a fake home with ~/.mothy/.state/vimeo-creds.json (lowest priority).
  const home = mkdtempSync(join(tmpdir(), 'mothy-home-'));
  const homeState = join(home, '.mothy', '.state');
  mkdirSync(homeState, { recursive: true });
  writeFileSync(
    join(homeState, 'vimeo-creds.json'),
    JSON.stringify({ VIMEO_ACCESS_TOKEN: 'home_token' }),
  );
  process.env.HOME = home;

  // Mid priority: $MOTHY_STATE_DIR file.
  writeFileSync(
    join(stateDir, 'vimeo-creds.json'),
    JSON.stringify({ VIMEO_ACCESS_TOKEN: 'statedir_token' }),
  );
  process.env.MOTHY_STATE_DIR = stateDir;

  try {
    // With env unset, $MOTHY_STATE_DIR wins over home.
    assert.equal(resolveCred('VIMEO_ACCESS_TOKEN'), 'statedir_token');

    // Env beats everything.
    process.env.VIMEO_ACCESS_TOKEN = 'env_token';
    assert.equal(resolveCred('VIMEO_ACCESS_TOKEN'), 'env_token');

    // Remove $MOTHY_STATE_DIR file -> falls through to home file.
    delete process.env.VIMEO_ACCESS_TOKEN;
    rmSync(join(stateDir, 'vimeo-creds.json'));
    assert.equal(resolveCred('VIMEO_ACCESS_TOKEN'), 'home_token');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('ElevenLabs value has surrounding double-quotes stripped', () => {
  process.env.ELEVENLABS_API_KEY = '"sk_quoted_value"';
  assert.equal(resolveCred('ELEVENLABS_API_KEY'), 'sk_quoted_value');
});

test('ElevenLabs quote-strip also applies to the file fallback', () => {
  writeFileSync(
    join(stateDir, '.env.local'),
    JSON.stringify({ ELEVENLABS_API_KEY: '"sk_from_file"' }),
  );
  process.env.MOTHY_STATE_DIR = stateDir;
  assert.equal(resolveCred('ELEVENLABS_API_KEY'), 'sk_from_file');
});

test('a missing cred returns null/undefined (does not throw)', () => {
  process.env.MOTHY_STATE_DIR = stateDir; // empty dir, no files
  let result;
  assert.doesNotThrow(() => {
    result = resolveCred('ZOHO_CLIENT_ID');
  });
  assert.ok(result == null, 'missing cred must be null or undefined');
});
