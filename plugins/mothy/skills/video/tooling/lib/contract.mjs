// Artifact-contract validators for the /video tooling.
//
// These guard the two hand-off artifacts a /video run produces and a
// downstream /article run consumes:
//
//   - steps.json         — the ordered, reader-parity step list. Every step
//                          must have a contiguous, 1-based idx (no gaps) and
//                          no orphans (each step carries both a screenshot
//                          `file` and a written `instruction`), so a reader
//                          of the article gets the same step-by-step parity
//                          they'd get from watching the video.
//   - vimeo-uploads.json — the upload record. Must carry the
//                          `player_embed_url` the article embeds at the top.
//
// Pure, no I/O. Each validator returns { ok, errors[] } so a caller can
// surface every problem at once instead of failing on the first.
//
// `action` is intentionally an OPEN string. The known set is
// {click,type,reveal,nav}, but a novel action (e.g. "scrub") must still
// validate so a new interaction type renders generically rather than
// hard-failing the contract.

const STEPS_SCHEMA_VERSION = 1;
const VIMEO_SCHEMA_VERSION = 1;

// Fields every step must carry. `action` is present-and-string but its value
// is open (see header). `idx`/`beatIdx` are numbers; the rest are strings.
const STEP_NUMBER_FIELDS = ['idx', 'beatIdx'];
const STEP_STRING_FIELDS = ['beat', 'action', 'label', 'file', 'instruction'];

function isNonEmptyString(v) {
  return typeof v === 'string' && v.length > 0;
}

function isInteger(v) {
  return typeof v === 'number' && Number.isInteger(v);
}

/**
 * Validate a steps artifact.
 * @param {unknown} obj
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateSteps(obj) {
  const errors = [];

  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, errors: ['steps: expected an object'] };
  }

  if (obj.schemaVersion !== STEPS_SCHEMA_VERSION) {
    errors.push(
      `steps.schemaVersion: expected ${STEPS_SCHEMA_VERSION}, got ${JSON.stringify(obj.schemaVersion)}`,
    );
  }

  const steps = obj.steps;
  if (!Array.isArray(steps)) {
    errors.push('steps.steps: expected an array');
    return { ok: errors.length === 0, errors };
  }
  if (steps.length === 0) {
    errors.push('steps.steps: must contain at least one step');
    return { ok: errors.length === 0, errors };
  }

  steps.forEach((step, i) => {
    const at = `steps.steps[${i}]`;
    if (step === null || typeof step !== 'object' || Array.isArray(step)) {
      errors.push(`${at}: expected an object`);
      return;
    }
    for (const f of STEP_NUMBER_FIELDS) {
      if (!isInteger(step[f])) {
        errors.push(`${at}.${f}: expected an integer`);
      }
    }
    // Orphan guards: a step missing its screenshot file or its written
    // instruction breaks reader/watcher parity.
    for (const f of STEP_STRING_FIELDS) {
      if (!isNonEmptyString(step[f])) {
        errors.push(`${at}.${f}: expected a non-empty string`);
      }
    }
  });

  // idx must be contiguous and 1-based: 1..N in array order.
  steps.forEach((step, i) => {
    const expected = i + 1;
    if (isInteger(step?.idx) && step.idx !== expected) {
      errors.push(
        `steps.steps[${i}].idx: expected ${expected} (contiguous, 1-based), got ${step.idx}`,
      );
    }
  });

  return { ok: errors.length === 0, errors };
}

/**
 * Validate a vimeo-uploads artifact.
 * @param {unknown} obj
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateVimeoUploads(obj) {
  const errors = [];

  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, errors: ['vimeo-uploads: expected an object'] };
  }

  if (obj.schemaVersion !== VIMEO_SCHEMA_VERSION) {
    errors.push(
      `vimeo-uploads.schemaVersion: expected ${VIMEO_SCHEMA_VERSION}, got ${JSON.stringify(obj.schemaVersion)}`,
    );
  }

  for (const f of ['id', 'link', 'player_embed_url']) {
    if (!isNonEmptyString(obj[f])) {
      errors.push(`vimeo-uploads.${f}: expected a non-empty string`);
    }
  }

  if (!isInteger(obj.duration) || obj.duration < 0) {
    errors.push('vimeo-uploads.duration: expected a non-negative integer');
  }

  return { ok: errors.length === 0, errors };
}
