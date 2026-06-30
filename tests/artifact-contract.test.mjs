// Artifact-contract validator tests for the /video tooling.
//
// RED-GREEN: these assert the reader-parity invariants that keep a /video run
// honest — every step has a contiguous 1-based idx (no gaps), no orphan steps
// (missing file or instruction), and a vimeo-uploads record carries the
// embed url a downstream /article needs to embed the video.
//
// Run: node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSteps, validateVimeoUploads } from '../plugins/mothy/skills/video/tooling/lib/contract.mjs';

function makeStep(idx) {
  return {
    idx,
    beat: 'intro',
    beatIdx: 1,
    action: 'click',
    label: `step ${idx}`,
    file: `step-${idx}.png`,
    instruction: `do thing ${idx}`,
  };
}

function validSteps() {
  return {
    schemaVersion: 1,
    steps: [makeStep(1), makeStep(2), makeStep(3)],
  };
}

function validVimeo() {
  return {
    schemaVersion: 1,
    id: '123456789',
    link: 'https://vimeo.com/123456789',
    player_embed_url: 'https://player.vimeo.com/video/123456789',
    duration: 42,
  };
}

test('validateSteps: a valid steps object passes', () => {
  const res = validateSteps(validSteps());
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
});

test('validateSteps: an idx GAP fails (reader-parity guard)', () => {
  const obj = validSteps();
  obj.steps[2].idx = 4; // 1,2,4 — gap at 3
  const res = validateSteps(obj);
  assert.equal(res.ok, false);
  assert.ok(res.errors.length > 0);
});

test('validateSteps: idx not 1-based fails', () => {
  const obj = { schemaVersion: 1, steps: [makeStep(0), makeStep(1)] };
  const res = validateSteps(obj);
  assert.equal(res.ok, false);
  assert.ok(res.errors.length > 0);
});

test('validateSteps: orphan step missing file fails', () => {
  const obj = validSteps();
  delete obj.steps[1].file;
  const res = validateSteps(obj);
  assert.equal(res.ok, false);
  assert.ok(res.errors.length > 0);
});

test('validateSteps: orphan step missing instruction fails', () => {
  const obj = validSteps();
  delete obj.steps[1].instruction;
  const res = validateSteps(obj);
  assert.equal(res.ok, false);
  assert.ok(res.errors.length > 0);
});

test('validateSteps: wrong schemaVersion fails', () => {
  const obj = validSteps();
  obj.schemaVersion = 2;
  const res = validateSteps(obj);
  assert.equal(res.ok, false);
});

test('validateSteps: empty steps fails', () => {
  const res = validateSteps({ schemaVersion: 1, steps: [] });
  assert.equal(res.ok, false);
});

test('validateSteps: action is an open string — a novel action type passes', () => {
  const obj = validSteps();
  obj.steps[0].action = 'scrub'; // not in known set, still valid
  const res = validateSteps(obj);
  assert.equal(res.ok, true);
});

test('validateVimeoUploads: a valid record passes', () => {
  const res = validateVimeoUploads(validVimeo());
  assert.equal(res.ok, true);
  assert.deepEqual(res.errors, []);
});

test('validateVimeoUploads: missing player_embed_url fails', () => {
  const obj = validVimeo();
  delete obj.player_embed_url;
  const res = validateVimeoUploads(obj);
  assert.equal(res.ok, false);
  assert.ok(res.errors.length > 0);
});

test('validateVimeoUploads: missing duration fails', () => {
  const obj = validVimeo();
  delete obj.duration;
  const res = validateVimeoUploads(obj);
  assert.equal(res.ok, false);
});
