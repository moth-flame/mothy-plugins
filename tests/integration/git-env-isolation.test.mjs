// git-env-isolation.test.mjs — fixtures must never write to the REAL repo.
//
// When git runs the pre-push hook it exports GIT_DIR (and, from a LINKED
// worktree, GIT_DIR=<main>/.git/worktrees/<name> plus friends). The hook runs
// `node --test tests/`, so every test process inherits those vars, and every
// fixture `git init` / `git config` / `git commit` that spawns git with the
// inherited env silently targets the repo being pushed instead of its temp dir:
// junk commits, a wiped index, the drill identity written into .git/config.
//
// This file reproduces that exact invocation against a DECOY repo — GIT_DIR,
// GIT_WORK_TREE, GIT_INDEX_FILE, GIT_COMMON_DIR all point at it — runs the
// git-spawning suites, and asserts the decoy is byte-for-byte untouched. The
// fix under test is tests/git-env.mjs, which scrubs every GIT_* var from the
// test process on import.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { cleanGitEnv } from '../git-env.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TESTS = join(REPO, 'tests');

// The suites that spawn git or a git-calling hook against temp repos.
const GIT_SUITES = [
  'tests/integration/pre-push-secret-scan.test.mjs',
  'tests/arm-push-gate.test.mjs',
  'tests/precompact-hooks.test.mjs',
];

function makeDecoy() {
  const dir = mkdtempSync(join(tmpdir(), 'git-env-decoy-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', env: cleanGitEnv() });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'decoy@example.invalid');
  git('config', 'user.name', 'decoy');
  writeFileSync(join(dir, 'decoy.txt'), 'decoy\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'decoy');
  return dir;
}

function snapshot(dir) {
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', env: cleanGitEnv() }).trim();
  return {
    head: git('rev-parse', 'HEAD'),
    commits: git('rev-list', '--all', '--count'),
    refs: git('for-each-ref', '--format=%(refname) %(objectname)'),
    config: readFileSync(join(dir, '.git', 'config'), 'utf8'),
    index: readFileSync(join(dir, '.git', 'index')).toString('base64'),
    worktree: readdirSync(dir).sort().join(','),
  };
}

test('G1 hook-style run with GIT_* aimed at a decoy leaves the decoy untouched', () => {
  const decoy = makeDecoy();
  try {
    const before = snapshot(decoy);
    const env = {
      ...cleanGitEnv(),
      GIT_DIR: join(decoy, '.git'),
      GIT_COMMON_DIR: join(decoy, '.git'),
      GIT_WORK_TREE: decoy,
      GIT_INDEX_FILE: join(decoy, '.git', 'index'),
    };
    // A nested `node --test` under a test runner sees NODE_TEST_CONTEXT and
    // runs NOTHING — which made an early draft of this test pass vacuously.
    delete env.NODE_TEST_CONTEXT;
    const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...GIT_SUITES], {
      cwd: REPO,
      encoding: 'utf8',
      env,
      timeout: 300_000,
    });
    const after = snapshot(decoy);
    // Prove the suites actually ran, or the decoy comparison means nothing.
    assert.match(`${r.stdout}${r.stderr}`, /^# pass [1-9]/m, `nested suites did not run:\n${r.stdout}${r.stderr}`);
    assert.deepEqual(after, before, `fixtures wrote to the decoy repo via inherited GIT_* env.\nsuite output:\n${r.stdout}${r.stderr}`);
    assert.equal(r.status, 0, `suites must still pass under a hook-style env:\n${r.stdout}${r.stderr}`);
  } finally {
    rmSync(decoy, { recursive: true, force: true });
  }
});

test('G2 cleanGitEnv strips every GIT_* var and keeps the rest', () => {
  const out = cleanGitEnv({ GIT_DIR: '/x', GIT_INDEX_FILE: '/y', GIT_AUTHOR_NAME: 'z', PATH: '/p', HOME: '/h' });
  assert.deepEqual(Object.keys(out).filter((k) => k.startsWith('GIT_')), []);
  assert.equal(out.PATH, '/p');
  assert.equal(out.HOME, '/h');
});

test('G3 every test file that spawns git or a git-calling hook imports git-env.mjs', () => {
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.test.mjs')) files.push(p);
    }
  };
  walk(TESTS);
  const SPAWNS_GIT = /(execFileSync|spawnSync|execSync|spawn|execFile)\(\s*['"]git['"]/;
  const RUNS_GIT_HOOK = /arm-push-gate\.mjs|precompact-snapshot\.sh|post-compaction-notice\.sh|\.githooks/;
  const IMPORTS = /import\s+(?:[^;]*from\s+)?['"](?:\.\.?\/)+git-env\.mjs['"]/;
  const missing = files
    .filter((f) => existsSync(f))
    .filter((f) => {
      const src = readFileSync(f, 'utf8');
      return (SPAWNS_GIT.test(src) || RUNS_GIT_HOOK.test(src)) && !IMPORTS.test(src);
    })
    .map((f) => relative(REPO, f));
  assert.deepEqual(missing, [], 'these files spawn git without the GIT_* scrub — import tests/git-env.mjs');
});
