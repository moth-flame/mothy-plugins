---
name: test
description: Deliberate test-authoring + test-auditing executor. Builds a coverage matrix across spec / mock-boundary / adversarial-input / cross-tenant lenses, writes red-green-proven tests in parallel, then ADVERSARIALLY AUDITS the tests themselves (do they fail on a broken impl? do they assert the spec or just restate the buggy impl? do they mock away the boundary where the bug actually lives?), runs mutation probes, escalates the highest-value real-boundary test that mocks can't cover, and gates on no-new-failures-vs-floor. Detects the repo's own test command instead of assuming one. Use when the user invokes /test [target], says "test this", "write tests for X", "are these tests any good", "audit the test coverage", "what would these tests miss", "make sure this actually works", or wants test coverage that finds what casual testing misses. Sibling to /build, /plan, /fix — same orchestration spine; its job is to make a green suite MEAN something.
metadata: { "openclaw": { "emoji": "🧪" } }
---

# test — Deliberate test-authoring + test-auditing protocol

<!-- BEGIN desktop-preflight — plugin-distribution copy ONLY. PRESERVE when re-syncing
     from the Mothy repo's .claude/skills/. The Mothy repo copies run on Agent37 and in
     a checked-out repo, where these conditions are already true; this block exists for
     teammates invoking the skill from the Claude desktop app. -->

## §0.0 — Preflight: check the workspace, then explain (MANDATORY — runs before anything else)

**Do this first — before reading files, before spawning any agent.** Many people reach
this skill from the **Claude desktop app**, where a session may not be pointed at a code
project at all. Do not start and then fail confusingly: check, and if something's missing,
explain it plainly.

1. **A real project folder is open** — source files you can read.
2. **The project has a test runner you can actually execute** (a `test` script in
   `package.json`, a `pytest`/`go test`/`cargo test` setup, or equivalent). Detect it —
   never assume a command. This skill's whole purpose is making a green suite mean
   something, so with nothing runnable it cannot do its job.

**If anything above is missing, STOP.** Do not spawn agents. Do not edit files. Do not
guess. Say what's missing in plain, non-technical language and give the desktop-app fix:

> I work on a real code project, and this chat isn't pointed at one yet. In the Claude
> desktop app, open the folder for the project you want me to work on — approve access
> when it asks — then send me your request again.

If a **test suite** is the missing piece, say that specifically rather than lumping it in:
the project opened fine, there's just nothing here I can run to prove a change is correct.
Offer the alternative instead of stalling — I can still read the code and explain what I'd
change; I just can't verify it.

Assume the person may not be technical. Never answer with a raw error, a stack trace, or a
terminal command they didn't ask for.

<!-- END desktop-preflight -->

> **What this skill is:** the sibling that distrusts a green suite. /build and /fix adversarially verify the *code*; /test adversarially audits the *tests*. The thesis: **a passing test proves nothing unless (a) it would FAIL on a broken implementation, and (b) it exercises the boundary where bugs actually live.** Most test suites are green theater — they mock away the exact seam (DB constraint, access policy, env, trigger, concurrency, auth) where real defects hide, and they assert the implementation's current behavior (including its bugs) rather than the spec. This skill exists to break that.
>
> **Repo-agnostic and OS-agnostic.** It detects the repo's test command and conventions rather than assuming them, and uses repo-relative paths only. It works on Windows, macOS, and Linux, in a repo with no `CLAUDE.md`, no `AGENTS.md`, no `docs/` directory, and no browser test setup.

## The five principles (the whole skill in one screen)

1. **A test that can't fail is theater.** If no plausible mutation of the implementation makes the test fail, it tests nothing. Red-green (fail before, pass after) is the floor; *mutation-survival* is the bar. (Catches T-01.)
2. **Assert the SPEC, not the impl.** A test that encodes "what the code currently does" passes forever, including over the code's bugs. The expected value must come from the requirement, never be read back from the implementation. (Catches T-02. Real example: a clone test asserted `seq: null` and `linkState: "clone"` — both were the *bug*; the test passed while the live DB rejected the write.)
3. **Mocks hide exactly the bugs that ship.** Green-mocked ≠ correct. Every mock replaces a real boundary — a DB `NOT NULL`/`CHECK`/`UNIQUE`/FK constraint, an RLS policy, a `SECURITY DEFINER` trigger, JSON (de)serialization, an env var, an auth token, a network call, a clock. The bug lives in the boundary the mock removed. **Enumerate what each mock replaces and test the riskiest seam against the real thing** (integration or a live/deployed smoke). (Catches T-03 — the single highest-yield class.)
4. **Adversarial + cross-tenant inputs, not the happy path.** Foreign credential → zero rows / 403. Null, empty, malformed, concurrent, oversized, wrong-tenant. The error and security paths are where the unverified behavior is. (Catches T-04.)
5. **Audit the auditor.** Automated checkers (verifiers, regression bots, static scans) lie — they grep the wrong file, diff a stale tree, or call a known-failure "new." Spot-check every machine verdict (pass *or* fail) against ground truth on disk / in the DB before trusting it. (Catches T-09; learned the hard way.)

## §0.1 — Repo conventions: detect, do not assume

**Use repo-relative paths only** (`tests/`, `spec/`, `src/`) — never absolute
paths, never an OS-specific path — so the same instructions run identically on
any machine.

1. **Find the target repo root** — `git -C <dir-of-the-target-files> rev-parse --show-toplevel`. That root, NOT the shell's working directory, is the target.
2. **Read these files if present:** `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, and anything they point at. **Their rules OVERRIDE this skill wherever they conflict** — especially the test harness, test-file layout, and the known failure floor.
3. **These files are OPTIONAL and their absence is normal.** Do not refuse, do not ask the user to create them, and do not import another project's conventions in their place.

Match the harness the repo already uses — an existing `tests/` tree, `test/`,
`spec/`, or co-located `*.test.*` / `*_test.go` / `test_*.py`. **Do not introduce
a new test runner.**

## §0.2 — Test command detection (NEVER hardcode a test command)

Resolve the command to run, in this order, and **state which source you used**:

a. **An explicit command the user gave** — always wins.
b. **The repo's own docs** — `CLAUDE.md`, `CONTRIBUTING.md`, or `README.md` if any of them names a test or regression command.
c. **`package.json` `scripts`** — prefer `test:unit`, else `test`, else an unambiguously-named runner script. Package manager from the lockfile: `pnpm-lock.yaml` → `pnpm run <script>`; `yarn.lock` → `yarn <script>`; `package-lock.json` or none → `npm run <script>`.
d. **Language-native default** for whatever manifest is present: `pytest` (`pyproject.toml` / `setup.cfg` / `requirements.txt`) · `go test ./...` (`go.mod`) · `cargo test` (`Cargo.toml`) · `dotnet test` (`*.sln` / `*.csproj`) · `bundle exec rspec` (`Gemfile` + `spec/`) · `mvn test` / `gradle test` · `node --test` (Node repo with tests but no script).
e. **If none of the above determines a command, ASK the user.** Never guess a command, and never report a suite as green when nothing actually ran.

**Browser / E2E verification is CONDITIONAL.** Run a Playwright / Cypress /
Selenium pass **only if the repo actually has that setup** — a config file, the
dependency installed, and a script or spec directory. If it does not, **skip
that step and say explicitly that it was skipped**, and rely on the other
layers. A missing browser gate must never block, error, or be reported as a
failure. Never author a spec for a browser runner the repo doesn't have
installed.

## §0.3 — Orchestration shape (preferred, with a plain fallback)

**Preferred when the harness supports it:** run the phases as a detached
background workflow with parallel sub-agents — one author agent per disjoint
test area, resumable, surviving a dropped connection.

**Fallback when it does not:** run the same phases **sequentially in one
session** — coverage matrix → author → audit → real-boundary + regression.
Every guarantee survives: red-green proof per test, the test-critic never told
the suite is green, bounded rework rounds, floor-based regression. **Nothing
here requires a Workflow or Task tool.**

**Model tiering by role, not by name:** use a cheap/fast tier for authoring
tests to a stated matrix row and for running suites, and a stronger/expensive
tier for the adversarial test-audit (§4), the conformance review (§6.5) and the
escalation call. The audit critic and the conformance reviewer are distinct
roles on distinct axes — one asks *would this test fail on a broken impl*, the
other asks *was the coverage that was promised actually delivered* — so run both
even when only one tier exists. Do not assume a particular model is available;
if only one tier exists, run everything there and say so.

## §0.4 — Compact sub-agent output (recommended)

Prepend the `CAVEMAN_ULTRA` preamble to sub-agent prompts. It applies to prose fields only (`reasoning`, `evidence`, `gap`, `rationale`, `red_proof`, `green_proof`, `mutation`, `suggested_test`). Code, test source, file paths, enum values, schema field names, error strings: NEVER compressed.

```js
const CAVEMAN_ULTRA = `
RESPONSE MODE: ultra caveman. Drop articles (a/an/the), filler (just/really/basically/actually),
pleasantries. Fragments OK. Short synonyms. Technical terms exact. Code blocks unchanged.
Test source unchanged. Errors quoted exact. Schema field values exact — caveman only on prose fields.
CALIBRATION IS CONTENT, NOT FILLER. Never compress away uncertainty, a qualifier, a severity or
a confidence level. "Might be exploitable" and "is exploitable" are different claims, and for a
verifier or a security reviewer the qualifier IS the finding. Keep whichever one is true.
NO LENGTH BUDGET. Caveman is about wording, never about how much you investigate or how many
findings you report. Dropping a finding to be brief makes "cut for space" indistinguishable from
"never found it" — measured, that is exactly how a shorter answer became a wrong answer.
Pattern: [thing] [action] [reason]. [next].
`
```

## §0.5 — Durability & resume (useful, optional, degrades gracefully)

**The test files on disk are the durable artifact** (as git commits are for
/build) — that guarantee needs no extra files. Optionally keep a state ledger
alongside them: the target under test, the coverage matrix, each test-area →
`pending | written <path> | audited <verdict> | escalated <reason>`, a resume
pointer if the harness gave you one, and the regression floor. Put it wherever
the repo already keeps working notes; if the repo has no such convention, keep
it in your working notes. **Never create a doc tree the repo doesn't use, and
never stall because a directory is absent.**

On resume: read the test files already on disk (plus the ledger if you kept
one); only author/audit areas not yet done. If the harness offers a resume
handle, replay it — completed agents return cached results.

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

Run tests with the command detected in §0.2 — **never a hardcoded one**, and
never a runner the repo doesn't have installed. Match the repo's existing
harness and test-file layout. Author browser specs only if the repo already has
a browser runner (§0.2); otherwise cover what you can at the layers that exist
and say the browser layer is absent.

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

### 6.5. Conformance review (MANDATORY — once, before the report)

The test-critic in §4 is aimed at a single test's assertion: *would this still
pass if the implementation were wrong?* It is a per-test question, and a suite
can answer it perfectly for every test it contains while **silently not
containing the tests that were promised.** Nobody in §2–§6 is asked whether the
delivered suite matches the matrix that justified it.

So after the audit and the real-boundary pass, run ONE more agent — the
**conformance reviewer** — over the whole deliverable: *was every matrix row
actually written, do the escalations line up with the requirements, and is
anything internally inconsistent?*

- **A separate role, not a replacement.** It does not redo §4 and never relaxes it. Different axis, run last, once.
- **Label it `conformance:`** — never `verify:` / `review:` / `critique:`. Those labels belong to the isolated adversarial critics in this toolchain (in /build a verifier is shown a diff, a rubric and types and deliberately nothing else, so it cannot rationalize "the tests pass, must be fine"). This agent is the opposite by design: **it is handed the matrix and the spec, because "was what was asked for delivered" is a question you structurally cannot put to a reviewer who never saw the ask.** Seeing them is correct here, not a bias leak — and keeping the labels distinct stops anyone later deciding an isolated verifier should see the requirements too.
- **The one bias rule it still keeps: a green suite is never evidence.** Same rule §4 lives by. "Everything passes" says nothing about whether the missing row was written.
- **Stronger/expensive tier** (§0.3) — spotting the row that quietly never became a file is a judgment call a weak model reads past.
- **Inputs — deliberately the full picture, that is the point:** the coverage matrix, the spec/requirements, the list of tests actually written with their audit verdicts, the escalated/`live` rows, and the real-boundary + regression result.
- **Output: a severity-ranked triage, worst first** — each finding naming the matrix row or requirement, what the suite actually delivers for it, and the gap. Plus a short brief you read FIRST, before the per-area audit verdicts.
- **No veto.** It hands you findings; you own the report and any hand-off to /fix. But an unresolved `critical` finding — a matrix row with no test and no tombstone — means the suite is not done, whatever the run summary says.

**What it is actually for: coverage reported as delivered that isn't.** An area
can be authored, audited sound, and reported complete while covering less than
the matrix row it was dispatched from — every check along the way is scoped to
the tests that exist, never to the ones that were supposed to. The conformance
reviewer is the only agent holding the original matrix at the end.

### 7. Floor-based regression + report

Run the full suite with the command detected in §0.2. Separate **new** failures
from the **pre-existing / environmental floor** (record the floor count + bucket
names; a missing local dependency, a flaky external, a known-broken module are
floor, not your regression). Gate = **no new failures vs floor**, not zero
failures (T-10). Report:
- Coverage matrix → which rows are covered, at which layer, which are `live`/escalated.
- Tests added (paths + count) + red-green proof.
- Audit verdicts (T-classes found + fixed; surviving mutations, if any).
- Real-boundary result (executed live: PASS/FAIL with evidence; or flagged with the run command).
- Regression: floor vs new.
- **Conformance triage (§6.5)** — matrix rows or requirements the suite does not actually cover, and how each was resolved or why it was accepted.
- **Honest residual risk**: the boundaries still unproven and the one test that would close the biggest gap.

### 8. Commit locally if the user asked; ask before pushing

Mirror /build §8: follow the repo's own conventions, stage explicit file names
(never `git add -A`, so scratch files and editor artifacts can't ride along),
match the existing commit-message style, add a co-author trailer if the repo
uses one. **Default: commit locally and stop — do NOT push, open a PR, or
deploy unless the user has already told you to.** A test that found a bug
commits with the failing test marked (`.todo` / `.fails` / `skip` per the repo's
convention) or hands the bug to /fix — never commit a silently-passing test over
a known defect.

## Orchestration boilerplate (illustrative)

> **If your harness is Claude Code, the shape below is the `Workflow` tool.** Call
> it with a script whose `meta` declares `name`, `description` and a `phases` list
> matching your `phase()` calls, then use `agent()` for a single pass,
> `parallel()` when you genuinely need every result before the next stage, and
> `pipeline()` — the default — when each item can flow through the stages
> independently. Run it in the background and keep the returned `runId` and
> `scriptPath`: that pair is what lets a dropped connection resume instead of
> restart. **If you do not have that tool, nothing here is lost** — run the same
> phases sequentially per §0.3. The phases are the method; the tool is one way to
> execute them.

Illustrative, not required — run the same phases sequentially if the harness has
no parallel sub-agents (§0.3). `TEST_CMD` comes from the §0.2 detection, never
from a literal.

```js
export const meta = {
  name: 'test-<target-slug>',
  description: 'Coverage-matrix → red-green tests → adversarial test-audit → mutation probe → real-boundary smoke for <target>',
  phases: [{ title: 'Coverage matrix' }, { title: 'Author' }, { title: 'Audit' }, { title: 'Real-boundary + regression' }, { title: 'Conformance' }]
}

// Detected per §0.2 — NEVER a hardcoded literal. E2E_CMD may be null.
const { TEST_CMD, E2E_CMD } = detectTestCommands(REPO_ROOT)

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
  agent(`${CAVEMAN_ULTRA}\n\n${BRIEF}\n\nWrite tests for: ${JSON.stringify(area)}\nRun with: ${TEST_CMD}. Match repo existing harness + layout; do NOT add a new runner.\nRed-green MANDATORY: prove each fails before / passes after. Expected from the SPEC, never read back from the impl. No silent skips (// SKIP: tombstone). Deterministic.`,
    { label:`author:${area.key}`, phase:'Author', schema:TEST_SCHEMA }))

phase('Audit')
// critic sees spec + test + impl diff + T-rubric; NOT told the suite is green; NOT given regression output
const audits = await parallel(written.filter(Boolean).map(t => () =>
  agent(`${CAVEMAN_ULTRA}\n\nTest-critic. The tests below are the null hypothesis: assume they are theater until disproven. Question is NOT "do they pass" — it is "would they still pass if the impl were WRONG".\n\nSPEC/MATRIX:\n${JSON.stringify(matrix)}\n\nTEST SOURCE:\n<${t.test_file}>\n\nIMPL DIFF:\n${IMPL_DIFF}\n\nT-RUBRIC (cite t_id):\n${T_RUBRIC}\n\nFor each test name the surviving_mutation (a concrete impl change that SHOULD fail it but would not). NO ACCESS to: whether the suite is green, regression output. Emit one t_coverage entry per T-01..T-10.`,
    { label:`audit:${t.area}`, phase:'Audit', schema:TestAuditVerdict }))
// rework areas with any high+ finding, bounded 3 rounds (see §4)

phase('Real-boundary + regression')
const real = await agent(`${CAVEMAN_ULTRA}\n\n${BRIEF}\n\nFrom the matrix layer=live|integration rows pick the HIGHEST-value test mocks cannot cover. EXECUTE it against the real substrate (real/dev DB or a deployed preview with real auth): hit the actual boundary, assert the real row / policy denial / status, then CLEAN UP. If infra is missing, output the exact command to run + which boundaries stay unproven. Then run the full suite with: ${TEST_CMD}. Separate NEW failures from the pre-existing/environmental floor. Report floor vs new.`,
  { label:'real+regression', phase:'Real-boundary + regression', schema:{ type:'object', required:['live_result','floor','new_failures','unproven_boundaries'], properties:{ live_result:{type:'string'}, floor:{type:'number'}, new_failures:{type:'array',items:{type:'string'}}, unproven_boundaries:{type:'array',items:{type:'string'}} } } })

phase('Conformance')
// Different axis from the audit (§6.5): "was the promised coverage delivered".
// Sees the matrix + spec ON PURPOSE. Stronger tier if available. Label `conformance:`, NEVER `verify:`.
const conformance = await agent(`${CAVEMAN_ULTRA}\n\nConformance reviewer — NOT the test-audit critic. Question: was every matrix row actually written, do escalations match the requirements, is anything internally inconsistent? A green suite is NOT evidence.\n\nMATRIX:\n${JSON.stringify(matrix)}\n\nSPEC:\n${BRIEF}\n\nTESTS WRITTEN:\n${JSON.stringify(written.filter(Boolean))}\n\nAUDIT VERDICTS:\n${JSON.stringify(audits.filter(Boolean))}\n\nREAL-BOUNDARY + REGRESSION:\n${JSON.stringify(real)}\n\nRank worst-first. Each finding: the matrix row / requirement, what the suite delivers for it, the gap. You have NO veto — emit a triage for the orchestrator.`,
  { label:'conformance', phase:'Conformance', schema:{ type:'object', required:['conforms','orchestrator_brief','findings'], properties:{
    conforms:{type:'boolean'}, orchestrator_brief:{type:'string'},
    findings:{ type:'array', items:{ type:'object', required:['severity','matrix_row','delivered','gap'],
      properties:{ severity:{enum:['critical','high','medium','low']}, matrix_row:{type:'string'},
        delivered:{type:'string'}, gap:{type:'string'} } } } } } })

return { matrix, written, audits, real, conformance }
```

## Auditing an EVAL (when the subsystem has one)

An eval is a test, so every principle above applies to it — and evals fail the
same way tests do, only more quietly, because a metric that reads 0.93 *looks*
like evidence. Audit the eval whenever the subsystem under test has one.

1. **Would this eval go RED on the regression it exists to catch?** (Principle 1
   applied to evals.) Mutation-test it: reintroduce the known-bad behaviour,
   re-run, and confirm the metric drops BELOW threshold. An eval that stays green
   on a known-bad prompt is green theater, and it is the most common shape of
   eval failure.
2. **Is the ground truth INDEPENDENT of the system under test?** (Audit the
   auditor.) The oracle must not be the thing being graded, nor a sibling of it.
   A self-oracle degrades in lockstep with the system, so the metric stays green
   while quality rots. Curated hand-labelled fixtures, a separate judge, or human
   labels — never "run it and grade it with itself."
3. **Did the SYSTEM UNDER TEST actually execute?** The failure mode unique to
   agent-run evals: an agent reads the fixtures, reasons about them itself, and
   reports metrics with the production code path never invoked. That is a
   FABRICATED eval and it is indistinguishable from a real one in a report. Look
   for a recorded `sut_model` and evidence the real runner ran.
4. **Did it run against the code under test, or against stale code?** An eval
   executed on a checkout or host that has not picked up the change grades the
   OLD behaviour and reports a meaningless green. Verify the tree/commit it ran
   against.
5. **Were the thresholds pre-registered, or tuned to the observed result?** A bar
   moved after seeing the number is not a bar. Check the history of the threshold
   constants against the history of the results.
6. **Model provenance.** The SUT runs on production parity; the judge and the
   fixtures may be subscription-backed and SHOULD prefer a strong model. A
   STRONGER-than-production SUT biases optimistic and is the dangerous direction
   — especially for parity-locked properties (prompt-injection resistance,
   instruction-following, output-format compliance, degeneracy/looping), which
   are properties of the model×prompt PAIR and which a stronger model masks
   entirely. See the matching section in `/plan`, `/build` and `/fix`.

Report eval findings alongside test findings. An eval that cannot fail is a
finding of the same severity as a test that cannot fail.

## Rules

- **Audit the eval too** (Auditing an EVAL §). If the subsystem has an eval, it is a test artifact and gets the same treatment: mutation-test it (would it go RED on the regression it exists to catch?), confirm the ground truth is independent of the system under test, confirm the SUT actually executed through the production path rather than an agent reasoning over the fixtures, confirm it ran against the code under test and not stale code, and confirm the thresholds were pre-registered rather than tuned to the result.
- **Compact sub-agent output** (§0.4). Code/test-source/errors/schemas exact.
- **Detect, don't assume** (§0.1). Read the repo's `CLAUDE.md` / `AGENTS.md` / `CONTRIBUTING.md` / `README.md` **if present**; their rules override this skill. Their absence is normal.
- **Never hardcode a test command** (§0.2). If it can't be detected, ask. Never report a suite as green when nothing ran.
- **Repo-relative paths only.** No absolute paths, no OS assumptions — this runs on Windows too.
- **Test it like a real user — live render, not just source-scan — when the repo has a browser setup and the change is user-facing.** A static spec that greps source for patterns is NOT testing a UI; it passes while the surface is visually broken. When a browser runner exists, include a live pass: start the app, log in, walk the actual user flow (and the negative/gating cases), screenshot every state, and judge layout/contrast/chrome/polish/first-time-viewer clarity from the rendered pixels. Static specs are a supplement, never the whole job. If the repo has **no** browser test setup, skip this and say so — never author specs for a runner the repo doesn't have.
- **Delegate execution where sub-agents exist.** Prefer having a sub-agent run the app, drive a browser, run suites, execute scripts, and SAVE screenshots to files; you write the briefs, read the saved screenshots, judge them, and decide. The "look with your own eyes" judgment is yours; the driving is the agent's. If no sub-agent mechanism is available, do it yourself sequentially (§0.3) — the discipline, not the delegation, is what matters.
- **Red-green or it doesn't count.** Every authored test is observed failing before it passes. A never-failed test is unproven.
- **Expected from the spec, never the impl** (T-02). If you must derive expected from behavior, you are writing a change-detector, not a test — say so.
- **Audit the tests adversarially** (§4). The critic's null hypothesis is "this suite is theater." It never uses "green" as evidence.
- **Name the surviving mutation.** Every theater finding must come with the concrete impl change the test fails to catch. No hand-waving.
- **Conformance review before the report** (§6.5). One more agent, labeled `conformance:` and never `verify:`, reads the coverage matrix and the spec alongside the delivered suite and asks the question the per-test audit cannot: was the coverage that was promised actually written? Separate from the audit critic, replacing neither, and still forbidden to treat "green" as evidence. No veto — but a matrix row with no test and no tombstone means the suite is not done.
- **Run at least one real-boundary test** (§6) or state plainly which boundaries are unproven. A green mocked suite never implies the real seam works.
- **Cross-tenant matrix is mandatory** for any org/anon/multi-user surface: foreign cred → zero / 403.
- **Floor-based regression** (§7): gate is no-NEW-failures, after separating the pre-existing/environmental floor.
- **Audit the auditor** (§5 principle, T-09): spot-check every machine verdict — verifier, regression bot, static scan — against ground truth on disk / in the DB. They produce false negatives (wrong-dir grep, stale diff) and false "new failures" (the floor).
- **Durable & resumable where possible** (§0.5): the test files on disk are the journal; the state ledger is optional and degrades gracefully; resume re-runs only undone areas.
- **Commit locally if asked; ask before pushing.** Explicit file names. A test that found a bug hands off to /fix; never commit a passing test over a known defect.
- **Match the repo's harness, file layout, and known failure floor** before writing — read its conventions if it documents any, and follow the existing tests if it doesn't.

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
