// git-env.mjs — keep test fixtures from writing to the REAL repo.
//
// git exports GIT_DIR (and from a linked worktree GIT_COMMON_DIR,
// GIT_INDEX_FILE, GIT_WORK_TREE, …) into the pre-push hook, which runs
// `node --test tests/`. Any fixture that then spawns git — or a hook that
// spawns git — with the inherited env targets the repo being pushed, not its
// temp dir. Importing this module scrubs every GIT_* var from THIS test
// process, so every child spawned with process.env (explicitly or by default)
// is clean. Guarded by tests/integration/git-env-isolation.test.mjs.

/** A copy of `env` with every GIT_* var removed. */
export function cleanGitEnv(env = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) if (!k.startsWith('GIT_')) out[k] = v;
  return out;
}

/** Delete every GIT_* var from `env` in place. */
export function scrubGitEnv(env = process.env) {
  for (const k of Object.keys(env)) if (k.startsWith('GIT_')) delete env[k];
  return env;
}

scrubGitEnv();
