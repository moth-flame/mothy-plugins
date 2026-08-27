/**
 * Pin the hooks.json FILE schema. Claude Code 2.1.x validates that file as
 * `{ hooks: Record<event, matchers> }`. A top-level event map fails the whole
 * plugin: path ["hooks"], expected record, received undefined. Lived on
 * 0.18.0 through 0.24.0. plugin.json's "hooks" key is a different document
 * and stays the inner event map.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  eventsFromHooksFile,
  readBothHookEventMaps,
  HOOKS_JSON_PATH,
} from './hook-wiring.mjs';

test('hooks.json wraps events in a top-level hooks key', () => {
  const doc = JSON.parse(readFileSync(HOOKS_JSON_PATH, 'utf8'));
  const events = eventsFromHooksFile(doc);
  assert.ok(events.PreCompact && events.SessionStart && events.UserPromptSubmit);
});

test('the two wiring locations carry identical event maps', () => {
  const { fromFile, fromPlugin } = readBothHookEventMaps();
  assert.deepEqual(fromFile, fromPlugin);
});

test('eventsFromHooksFile refuses the unwrapped shape that failed to load', () => {
  assert.throws(
    () => eventsFromHooksFile({ SessionStart: [], PreCompact: [], UserPromptSubmit: [] }),
    /missing top-level "hooks" wrapper/,
  );
});
