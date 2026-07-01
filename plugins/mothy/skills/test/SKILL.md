---
name: test
description: Deliberate test-authoring + test-auditing executor. Builds a coverage matrix across spec / mock-boundary / adversarial-input / cross-tenant lenses, writes red-green-proven tests in parallel, then ADVERSARIALLY AUDITS the tests themselves (do they fail on a broken impl? do they assert the spec or just restate the buggy impl? do they mock away the boundary where the bug actually lives?), runs mutation probes, escalates the highest-value real-boundary test that mocks can't cover, and gates on no-new-failures-vs-floor. Use when the user invokes /test <target>, says "test this", "write tests for X", "are these tests any good", "audit the test coverage", "what would these tests miss", "make sure this actually works", or wants test coverage that finds what casual testing misses. Sibling to /build, /plan, /fix — same orchestration spine; its job is to make a green suite MEAN something.
metadata: { "openclaw": { "emoji": "🧪" } }
---

# test — Deliberate test-authoring + test-auditing protocol

> **v1 (2026-06):** /test is the sibling that distrusts a green suite. /build and /fix adversarially verify the *code*; /test adversarially audits the *tests*. The thesis: **a passing test proves nothing unless (a) it would FAIL on a broken implementation, and (b) it exercises the boundary where bugs actually live.** Most test suites are green theater — they mock away the exact seam (DB constraint, RLS, env, trigger, concurrency, auth) where real defects hide, and they assert the implementation's current behavior (including its bugs) rather than the spec. This skill exists to break that.
>
> **v1 — ultra caveman mode mandatory** for ALL sub-agent free-text (§0.5). Cuts agent output tokens ~75%. Schemas/code/test-source/errors stay exact.
>
> **v1 — durability & resume mandatory** (§0.6 + §10). Runs in a detached, resumable background Workflow; the test files themselves + a state file are the journal.

## The five principles (the whole skill in one screen)

1. **A test that can't fail is theater.** If no plausible mutation of the implementation makes the test fail, it tests nothing. Red-green (fail before, pass after) is the floor; *mutation-survival* is the bar. (Catches T-01.)
2. **Assert the SPEC, not the impl.** A test that encodes "what the code currently does" passes forever, including over the code's bugs. The expected value must come from the requirement, never be read back from the implementation. (Catches T-02. Real example: a clone test asserted `seq: null` and `linkState: "clone"` — both were the *bug*; the test passed while the live DB rejected the write.)
3. **Mocks hide exactly the bugs that ship.** Green-mocked ≠ correct. Every mock replaces a real boundary — a DB `NOT NULL`/`CHECK`/`UNIQUE`/FK constraint, an RLS policy, a `SECURITY DEFINER` trigger, JSON (de)serialization, an env var, an auth token, a network call, a clock. The bug lives in the boundary the mock removed. **Enumerate what each mock replaces and test the riskiest seam against the real thing** (integration or a live/deployed smoke). (Catches T-03 — the single highest-yield class.)
4. **Adversarial + cross-tenant inputs, not the happy path.** Foreign credential → zero rows / 403. Null, empty, malformed, concurrent, oversized, wrong-tenant. The error and security paths are where the unverified behavior is. (Catches T-04.)
5. **Audit the auditor.** Automated checkers (verifiers, regression bots, static scans) lie — they grep the wrong file, diff a stale tree, or call a known-failure "new." Spot-check every machine verdict (pass *or* fail) against ground truth on disk / in the DB before trusting it. (Catches T-09; learned the hard way.)

## §0.5 — Ultra caveman mode for sub-agents (MANDATORY)

Every `agent(...)` prompt this skill spawns MUST prepend the `CAVEMAN_ULTRA` preamble. Caveman applies to prose fields only (`reasoning`, `evidence`, `gap`, `rationale`, `red_proof`, `green_proof`, `mutation`, `suggested_test`). Code, test source, file paths, enum values, schema field names, error strings: NEVER cavemanized.

```js
const CAVEMAN_ULTRA = `
RESPONSE MODE: ultra caveman. Drop articles (a/an/the), filler (just/really/basically/actually),
pleasantries, hedging. Fragments OK. Short synonyms. Technical terms exact. Code blocks unchanged.
Test source unchanged. Errors quoted exact. Schema field values exact — caveman only on prose fields.
Pattern: [thing] [action] [reason]. [next].
`
```

## §0.6 — Durability & resume (MANDATORY)

The test files are the durable artifact (like git is for /build). Maintain a state file `docs/drafts/<YYYY-MM-DD>_<TARGET>-test-state.md` (or `./.test-state/` if no `docs/`): the target under test, the coverage matrix, each test-area → `pending | written <path> | audited <verdict> | escalated <reason>`, the Workflow `runId` + `scriptPath` + resume command, and the regression floor. Write it at dispatch; update per area. On resume: read the state file + the test files already on disk; only author/audit areas not yet done. Re-run the cached Workflow (`Workflow({scriptPath, resumeFromRunId})`) — completed agents return cached results.

## When to use

User says one of:
- `/test <target>` (a feature, a file, a diff, a deployed change, a bug)
- "test this", "write tests for X", "cover this"
- "are these tests any good", "audit the test coverage", "what would these tests miss", "would this catch a bug"
- "make sure this actually works" / "verify it works for real" (→ emphasize §6 real-boundary/live)
- After /build or /fix, to harden the suite a unit produced.

NOT for: implementing features (that's /build), fixing a diagnosed bug (that's /fix), or pure design (that's /plan). /test may *find* a bug — when it does, it writes the failing test and hands off to /fix (or fixes inline only if trivial and the user asked).

## Protocol

### 0. Classify the test job

| Mode | Trigger | Emphasis |
|------|---------|----------|
| **author** | new/changed code with thin or no tests | coverage matrix → write → audit |
| **audit** | "are these tests good / what do they miss" | skip authoring; run the §4 adversarial audit + §5 mutation probe on the existing suite, report gaps |
| **repro** | a reported bug | reproduce-first: a failing test that captures the bug (then /fix) |
| **parity** | a refactor (behavior should be unchanged) | byte-for-byte before/after: same inputs → same outputs + same throws |
| **verify-real** | "make sure it works on dev/prod for real" | §6 real-boundary + live smoke is the deliverable, mocks are secondary |

### 1. Locate the target + the spec

The **spec** is what the test asserts against, and it must be independent of the implementation. In order: explicit acceptance criteria (plan doc / ticket / the user's words) → the type/interface contract → the schema/DB constraints → the observable behavior described in comments. **Never derive the expected value by running the implementation** — that is T-02. If no spec exists, state the spec you are testing against *before* writing the test.

### 2. Build the coverage matrix (the planning lens — /plan-style, multi-lens)

Before writing a single test, enumerate what MUST be covered, across these lenses. This is the step casual testing skips and the reason it misses bugs.

For the target, produce a matrix of `{ case, lens, layer, expected, source_of_expected }`:

- **Spec lens** — one row per acceptance criterion. `expected` from the spec.
- **Mock-boundary lens** — list every real boundary the code touches: DB constraints (`NOT NULL`, `CHECK`, `UNIQUE`, FK, default-vs-explicit-null), RLS policies, triggers (esp. `SECURITY DEFINER` — it bypasses RLS), (de)serialization, env vars, auth tokens, network, clock/random, ordering. For each: can a mocked unit test catch a violation here? If **no**, mark it `layer: integration` or `layer: live` — these are the rows that must run against the real substrate (§6).
- **Adversarial-input lens** — null, undefined, empty, `0`/`""`/`[]`, oversized, malformed, wrong-type, duplicate, concurrent (TOCTOU).
- **Cross-tenant / auth lens** (any org/anon/multi-user surface, MANDATORY) — foreign credential, foreign org id, wrong role, expired/absent token → must return **zero rows / 403 / refusal**, never another tenant's data.
- **Error-path lens** — every `throw`/`catch`/non-200 branch reached and asserted (code AND message where it's a contract).
- **Parity lens** (refactor mode) — old behavior captured as the expectation.

Flag rows where `source_of_expected` is "the implementation" — those are T-02 traps; re-derive from the spec.

### 3. Author tests per area, red-green proven (NON-NEGOTIABLE)

Fan out one agent per matrix area (parallel; disjoint test files so no collision). Each test MUST:

1. **Red proof** — run before the impl is correct (or with the impl reverted / a deliberate break) and confirm it FAILS with the expected symptom. A test never observed failing is not known to test anything.
2. **Green proof** — passes against the correct impl.
3. **No silent skips** — a case from the matrix that's genuinely impractical to test gets an explicit `// SKIP: <reason>` tombstone, never a quiet omission (T-05).
4. **Deterministic** — no real clock/random/network/order dependence; inject them. A flaky test is worse than no test (T-08).
5. **Expected-from-spec** — the assertion's expected value traces to the matrix `source_of_expected`, not to a value read back from the code.

Repo test commands are CWD-aware (mirror /build): Vitest (`npm run test:unit` / `npx vitest run <file>`), Playwright (`npx playwright test <file>` — static source-scan specs for surfaces jsdom can't render), `node --test`, etc. Match the repo's existing harness; do not introduce a new test runner.

### 4. Adversarially AUDIT the tests (THE differentiator — MANDATORY for non-trivial)

This is where /test diverges from /build. In /build the verifier reviews the *impl* and is **forbidden the test file**. In /test the artifact under review **is the test**, so the critic sees it — but the isolation that matters is inverted:

**The test-critic is given the SPEC + the T-rubric + the test source + the impl diff, and is FORBIDDEN to use "the tests pass" as evidence of anything.** A green suite is the null hypothesis to be disproven, not a result. The critic's question is never "do these pass?" — it is **"would these still pass if the implementation were wrong?"**

**Critic inputs:** the matrix/spec, the test source, the impl diff (so it can reason about mutations), the `T-01..T-10` rubric (§4.6). **Critic must NOT be told** the suite is green, nor see the regression output — that's the bias it exists to kill.

Critic returns `TestAuditVerdict` per area: for each test, which T-classes it trips, with `file:line` + the **mutation that would survive it** (the concrete impl change that should fail this test but wouldn't). A test with a named surviving-mutation is theater → rework.

**Failure handling** (bounded 3 rounds, mirror /build §4.5): any `T-xx` at severity ≥ high → rework the test (strengthen the assertion, de-mock the boundary, add the adversarial case) → re-audit. After 3 rounds unresolved → escalate to the user; do not claim the suite is sound.

### 4.6. The T-rubric — why your tests didn't catch it (closed set)

Findings without a `T-id` from this table are dropped by the harness.

| ID | Class | Smell — what it catches |
|----|-------|-------------------------|
| **T-01** | **Theater / mutation-survivor** | No plausible mutation of the impl makes this test fail. Over-mocked so it passes regardless of impl correctness; or asserts only that a function was *called*, not that the result is right. (Superset of build R-06.) |
| **T-02** | **Asserts the impl, not the spec** | Expected value was read back from the implementation's current behavior, so it can never disagree with it — including when that behavior is the bug. Real: `expect(seq).toBe(null)` / `expect(linkState).toBe("clone")` both froze a defect. |
| **T-03** | **Mocks the boundary where the bug lives** | The realistic failure is a DB constraint (`NOT NULL`/`CHECK`/`UNIQUE`/FK), RLS, a `SECURITY DEFINER` trigger, (de)serialization, an env var, or auth — all replaced by the mock, so this layer structurally cannot catch it. Demands an integration/live test (§6). The #1 ship-bug class. |
| **T-04** | **Happy-path only** | No foreign-cred, null, empty, malformed, concurrent, or error-branch case. Security + error behavior unverified. |
| **T-05** | **Silent skip, no tombstone** | A matrix/acceptance case dropped as "hard to test" with no visible `// SKIP:` marker. Looks covered; isn't. |
| **T-06** | **Over-fitted** | Asserts one hyper-specific input; the general case for the same class is untested, so the bug recurs for the next input. |
| **T-07** | **Tautological / circular** | The test computes its expected value using the same code (or a copy of it) the impl uses — they can't disagree. |
| **T-08** | **Non-deterministic** | Depends on real clock/random/iteration order/network; flaky, or intermittently masks a real failure. |
| **T-09** | **Wrong-layer / no ground-truth** | A static/source-scan asserts a pattern in the wrong file or against a stale tree; or a checker reports a verdict it never confirmed against the actual file/DB. (The "audit the auditor" class.) |
| **T-10** | **Floor-blind regression** | Treats every failure as equal, or reads "green" as zero-failures, without separating the pre-existing/environmental failure floor → either false-alarms on the floor or masks a genuine new failure inside it. |

### 5. Mutation probe (high-value confirmation)

For the riskiest 1–3 behaviors, name a concrete mutation of the impl (flip a `>` to `>=`, drop a guard, return `null`, swap a column, weaken an auth check) and confirm **at least one test fails** for each. A mutation no test catches is a coverage hole — write the test that catches it. This is the cheapest possible proxy for mutation testing and it directly measures whether the suite has teeth. (If the repo has a real mutation-testing tool, prefer it; this is the manual stand-in.)

### 6. Real-boundary escalation — the test mocks cannot write (MANDATORY consideration)

From the matrix's `layer: integration | live` rows, identify the **single highest-value test that a mocked unit cannot cover**, and either:
- **Execute it** — an integration test against a real (test/dev) DB, or a live smoke against a deployed preview with real auth: hit the actual endpoint, assert the real-DB row / RLS denial / status code, then clean up. This is what catches the `NOT NULL` violation, the `link_state` `CHECK`, the missing env var, the `SECURITY DEFINER` RLS bypass, the cross-org IDOR — none of which any mock will ever show.
- **Or flag it loudly** with the exact command to run, if executing it needs credentials/infra the session lacks. Never let a green mocked suite imply the real boundary is verified — say plainly which boundaries are unproven.

> **This section is the soul of the skill.** In practice, when a suite is "all green" but ships bugs, ~every one of those bugs was a `layer: live` row that was never run. Default to running at least one.

### 7. Floor-based regression + report

Run the full suite. Separate **new** failures from the **pre-existing / environmental floor** (record the floor count + bucket names; a dep missing from `node_modules`, a flaky external, a known-broken module are floor, not your regression). Gate = **no new failures vs floor**, not zero failures (T-10). Report:
- Coverage matrix → which rows are covered, at which layer, which are `live`/escalated.
- Tests added (paths + count) + red-green proof.
- Audit verdicts (T-classes found + fixed; surviving mutations, if any).
- Real-boundary result (executed live: PASS/FAIL with evidence; or flagged with the run command).
- Regression: floor vs new.
- **Honest residual risk**: the boundaries still unproven and the one test that would close the biggest gap.

### 8. Commit (only if the user asked; never push)

Mirror /build §8: explicit file names (never `git add -A`, never `.DS_Store`), Conventional Commits, co-author line, **no push**. A test that found a bug commits with the failing test marked (`.todo`/`.fails` per the repo convention) or hands the bug to /fix — never commit a silently-passing test over a known defect.

## Workflow tool boilerplate

```js
export const meta = {
  name: 'test-<target-slug>',
  description: 'Coverage-matrix → red-green tests → adversarial test-audit → mutation probe → real-boundary smoke for <target>',
  phases: [{ title: 'Coverage matrix' }, { title: 'Author' }, { title: 'Audit' }, { title: 'Real-boundary + regression' }]
}

// Schemas
const MATRIX_SCHEMA = { type:'object', required:['areas'], properties:{ areas:{ type:'array', items:{
  type:'object', required:['case','lens','layer','expected','source_of_expected'],
  properties:{ case:{type:'string'}, lens:{enum:['spec','mock_boundary','adversarial','cross_tenant','error_path','parity']},
    layer:{enum:['unit','integration','live']}, expected:{type:'string'}, source_of_expected:{type:'string'} } } } } }

const TEST_SCHEMA = { type:'object', required:['area','test_file','red_proof','green_proof'], properties:{
  area:{type:'string'}, test_file:{type:'string'}, red_proof:{type:'string'}, green_proof:{type:'string'} } }

const TestAuditVerdict = { type:'object', required:['area','overall','findings','t_coverage'], properties:{
  area:{type:'string'}, overall:{enum:['sound','rework','escalate']},
  findings:{ type:'array', items:{ type:'object', required:['t_id','severity','file','line','surviving_mutation','suggested_test'],
    properties:{ t_id:{enum:['T-01','T-02','T-03','T-04','T-05','T-06','T-07','T-08','T-09','T-10']},
      severity:{enum:['critical','high','medium','low']}, file:{type:'string'}, line:{type:'number'},
      surviving_mutation:{type:'string'}, suggested_test:{type:'string'} } } },
  t_coverage:{ type:'object', patternProperties:{ '^T-(0[1-9]|10)$':{enum:['ok','fail','n/a']} } } } }

const T_RUBRIC = `
T-01 theater/mutation-survivor   T-02 asserts impl not spec   T-03 mocks the boundary where the bug lives
T-04 happy-path only   T-05 silent skip no tombstone   T-06 over-fitted   T-07 tautological/circular
T-08 non-deterministic   T-09 wrong-layer/no ground-truth   T-10 floor-blind regression
`

phase('Coverage matrix')
const matrix = await agent(`${CAVEMAN_ULTRA}\n\n${BRIEF}\n\nBuild the coverage matrix (§2). Enumerate spec rows, the REAL boundaries each mock replaces (mark uncatchable-by-mock rows layer=integration|live), adversarial inputs, cross-tenant cases, error paths. For every row state source_of_expected; flag any sourced from 'the implementation' (T-02 trap).`,
  { label:'matrix', phase:'Coverage matrix', schema:MATRIX_SCHEMA })

phase('Author')
// one area per disjoint test file; red-green proven
const written = await parallel(groupAreas(matrix.areas).map(area => () =>
  agent(`${CAVEMAN_ULTRA}\n\n${BRIEF}\n\nWrite tests for: ${JSON.stringify(area)}\nRed-green MANDATORY: prove each fails before / passes after. Expected from the SPEC, never read back from the impl. No silent skips (// SKIP: tombstone). Deterministic.`,
    { label:`author:${area.key}`, phase:'Author', schema:TEST_SCHEMA }))

phase('Audit')
// critic sees spec + test + impl diff + T-rubric; NOT told the suite is green; NOT given regression output
const audits = await parallel(written.filter(Boolean).map(t => () =>
  agent(`${CAVEMAN_ULTRA}\n\nTest-critic. The tests below are the null hypothesis: assume they are theater until disproven. Question is NOT "do they pass" — it is "would they still pass if the impl were WRONG".\n\nSPEC/MATRIX:\n${JSON.stringify(matrix)}\n\nTEST SOURCE:\n<${t.test_file}>\n\nIMPL DIFF:\n${IMPL_DIFF}\n\nT-RUBRIC (cite t_id):\n${T_RUBRIC}\n\nFor each test name the surviving_mutation (a concrete impl change that SHOULD fail it but would not). NO ACCESS to: whether the suite is green, regression output. Emit one t_coverage entry per T-01..T-10.`,
    { label:`audit:${t.area}`, phase:'Audit', schema:TestAuditVerdict }))
// rework areas with any high+ finding, bounded 3 rounds (see §4)

phase('Real-boundary + regression')
const real = await agent(`${CAVEMAN_ULTRA}\n\n${BRIEF}\n\nFrom the matrix layer=live|integration rows pick the HIGHEST-value test mocks cannot cover. EXECUTE it against the real substrate (real/dev DB or a deployed preview with real auth): hit the actual boundary, assert the real-DB row / RLS denial / status, then CLEAN UP. If infra is missing, output the exact command to run + which boundaries stay unproven. Then run the full suite; separate NEW failures from the pre-existing/environmental floor. Report floor vs new.`,
  { label:'real+regression', phase:'Real-boundary + regression', schema:{ type:'object', required:['live_result','floor','new_failures','unproven_boundaries'], properties:{ live_result:{type:'string'}, floor:{type:'number'}, new_failures:{type:'array',items:{type:'string'}}, unproven_boundaries:{type:'array',items:{type:'string'}} } } })

return { matrix, written, audits, real }
```

## Rules

- **Ultra caveman** for every sub-agent prompt (§0.5). Code/test-source/errors/schemas exact.
- **Test it like a real user — live render, not just source-scan (MANDATORY for any UI).** A static Playwright spec that greps source for patterns is NOT testing a UI; it passes while the surface is visually broken. For any user-facing change, `/test` MUST include a live pass: start the app, log in, walk the actual user flow (and the negative/gating cases), screenshot every state, and judge layout/contrast/chrome/polish/tooltips/first-time-viewer clarity from the rendered pixels. Static specs are a supplement, never the whole job. (Cost of skipping this: a green static suite shipped a bare-dark-page UI and wasted Rich's time.)
- **Delegate ALL execution, not just authoring (orchestrator-only, hard rule).** The main thread does NOT run the app, drive a browser/Playwright, run suites, execute DB/SQL scripts, or take screenshots itself. It dispatches a sub-agent to do that and to SAVE screenshots to files; the main thread only writes briefs, Reads the saved screenshots, judges them, and decides. The "look with your own eyes" judgment is the main thread's; the *driving* is the sub-agent's. If you're about to open a terminal to "just check," dispatch it instead.
- **Red-green or it doesn't count.** Every authored test is observed failing before it passes. A never-failed test is unproven.
- **Expected from the spec, never the impl** (T-02). If you must derive expected from behavior, you are writing a change-detector, not a test — say so.
- **Audit the tests adversarially** (§4). The critic's null hypothesis is "this suite is theater." It never uses "green" as evidence.
- **Name the surviving mutation.** Every theater finding must come with the concrete impl change the test fails to catch. No hand-waving.
- **Run at least one real-boundary test** (§6) or state plainly which boundaries are unproven. A green mocked suite never implies the real seam works.
- **Cross-tenant matrix is mandatory** for any org/anon/multi-user surface: foreign cred → zero / 403.
- **Floor-based regression** (§7): gate is no-NEW-failures, after separating the pre-existing/environmental floor.
- **Audit the auditor** (§5 principle, T-09): spot-check every machine verdict — verifier, regression bot, static scan — against ground truth on disk / in the DB. They produce false negatives (wrong-dir grep, stale diff) and false "new failures" (the floor).
- **Durable & resumable** (§0.6 + §10): background Workflow, the test files + state file are the journal, resume re-runs only undone areas.
- **No push.** Commit only if asked, explicit files. A test that found a bug hands off to /fix; never commit a passing test over a known defect.
- **Read the repo's CLAUDE.md / test conventions** before writing — match the harness, the file layout, the floor.

## Anti-patterns

- **"All green, ship it."** Green over mocks is the null result, not a pass. Did any test ever fail? Would any fail if the impl broke? Was any real boundary touched?
- **Asserting what the code does.** Reading the expected value out of the implementation (or a snapshot of its current output) — the test then blesses every bug as correct (T-02).
- **Mocking the database / RLS / env and calling it tested.** The bug is in the part you mocked away (T-03). At least one integration/live test, always.
- **Happy path only.** No foreign cred, no null, no concurrent, no error branch (T-04).
- **Letting the critic see "the suite passes."** That restores the self-preferential bias the audit exists to kill.
- **Trusting a verifier/regression verdict without ground-truth check** — they grep the wrong directory and call a working file "missing," or count the known floor as "new" (T-09/T-10).
- **A static source-scan pinned to a file the logic has since moved out of** — asserts a pattern that relocated; passes or fails for the wrong reason (T-09).
- **Silent skips.** Dropping a hard-to-test acceptance criterion with no `// SKIP:` tombstone (T-05).
- **Snapshot-everything.** A giant snapshot that "passes" on any change you bless re-records — it detects change, not correctness.
- **Generating the expected with the same helper the impl uses** (T-07) — they can't disagree.
- **Re-running a test area already written + audited after a disconnect.** Check the test files + state file first; resume only the undone areas.
```
