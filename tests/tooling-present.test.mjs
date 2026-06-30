/**
 * tooling-present.test.mjs
 *
 * Guards the vendored demo tooling under the video skill. The /video skill
 * resolves these files via ${CLAUDE_PLUGIN_ROOT}/skills/video/tooling/... at
 * runtime, so a botched vendor (missing file, wrong path, truncated copy) or a
 * leaked secret must fail CI here rather than at demo time.
 *
 * Asserts, for each of the 5 vendored files:
 *   - it exists at the expected path
 *   - it is non-empty
 *   - it does NOT contain the literal demo-capture password
 *   - it does NOT contain an ElevenLabs API key literal
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const TOOLING = path.join(REPO_ROOT, 'plugins', 'mothy', 'skills', 'video', 'tooling');

const VENDORED = [
  path.join(TOOLING, 'lib', 'overlay.js'),
  path.join(TOOLING, 'lib', 'urlbar.js'),
  path.join(TOOLING, 'lib', 'ffmpeg.mjs'),
  path.join(TOOLING, 'tts.mjs'),
  path.join(TOOLING, 'assemble.mjs'),
];

// The literal demo-capture password must never be vendored into the plugin.
const DEMO_PASSWORD = 'Vg0uQK9SGv3tBqxiyw8F9mMZ!7';

// ElevenLabs keys are 32 lowercase-hex chars, conventionally prefixed `sk_`.
// Match either the `sk_` prefixed form or a bare 32-hex run assigned to an
// ELEVEN(LABS)_API_KEY identifier, so a hardcoded key can't slip through.
const EL_KEY_PATTERNS = [
  /sk_[0-9a-f]{32,}/i,
  /ELEVEN(?:LABS)?_API_KEY\s*[:=]\s*['"][0-9a-f]{32,}['"]/i,
];

test('all 5 vendored tooling files exist and are non-empty', () => {
  for (const file of VENDORED) {
    let st;
    assert.doesNotThrow(() => {
      st = statSync(file);
    }, `expected vendored file to exist: ${file}`);
    assert.ok(st.isFile(), `expected a regular file: ${file}`);
    assert.ok(st.size > 0, `expected non-empty file: ${file}`);
  }
});

test('no vendored file leaks the demo-capture password literal', () => {
  for (const file of VENDORED) {
    const text = readFileSync(file, 'utf8');
    assert.ok(
      !text.includes(DEMO_PASSWORD),
      `vendored file leaks the demo-capture password: ${file}`,
    );
  }
});

test('no vendored file leaks an ElevenLabs API key literal', () => {
  for (const file of VENDORED) {
    const text = readFileSync(file, 'utf8');
    for (const pat of EL_KEY_PATTERNS) {
      assert.ok(
        !pat.test(text),
        `vendored file appears to contain an ElevenLabs key literal (${pat}): ${file}`,
      );
    }
  }
});
