---
name: test
description: Deliberate test-authoring + test-auditing executor. Covers the behaviors a change touches, writes red-green-proven tests for deterministic logic, proves screens and model behavior live, and on request ADVERSARIALLY AUDITS existing tests (would they fail on a broken implementation? do they assert the spec or restate the buggy impl? do they mock away the boundary where the bug lives?) with mutation probes. Detects the repo's own test command instead of assuming one. Gates on no-new-failures-vs-floor. Use when the user invokes /test [target], says "test this", "write tests for X", "are these tests any good", "audit the test coverage", "what would these tests miss", "make sure this actually works". Sibling to /build, /plan, /fix; its job is to make a green suite MEAN something.
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

> **Adding a MANDATORY line requires deleting or merging one.** Eval rules: the `evals` skill. /test is the opt-in home for mutation probes and test
> audits; /build and /fix don't run them by default.

## The principles

1. **A test that can't fail is theater.** Red-green is the floor; a test never observed failing is
   unproven.
2. **Assert the SPEC, not the impl.** The expected value comes from the requirement, never read
   back from the code (a clone test once froze `seq: null` — the bug — as correct).
3. **Mocks hide exactly the bugs that ship.** Every mock replaces a real boundary (DB constraint,
   RLS, trigger, serialization, env, auth, clock); test the riskiest one against the real thing.
4. **Test the right thing.** Deterministic logic gets unit tests. Screens and model behavior are
   proven live, plus unit tests for the people/safety rules they rely on. **Never write tests that
   pin guards for hypotheticals or doc/prompt wording.**
5. **Audit the auditor.** Spot-check any machine verdict (verifier, regression bot, static scan)
   against ground truth before trusting it.

## Sub-agent preamble and models

Every `agent()` prompt starts with `CAVEMAN_ULTRA` (code, test source, errors, schema values exact):

```js
const CAVEMAN_ULTRA = `
RESPONSE MODE: ultra caveman. Drop articles, filler, pleasantries. Fragments OK.
Technical terms exact. Code blocks unchanged. Errors quoted exact.
CALIBRATION IS CONTENT, NOT FILLER. Keep qualifiers, severity and confidence.
Report only findings that change the decision, worst first, at most 5.
Pattern: [thing] [action] [reason]. [next].`
```

**Model tiering (by role, not by name):** test authors and the live/real-boundary runner on the
cheap tier; the test-audit critic on the strong tier (a different family from the authors when
available). Don't assume a specific model exists.

## When to use

`/test <target>`, "test this", "are these tests any good", "make sure this actually works". NOT for
building (/build), fixing (/fix) or design (/plan). A bug found here becomes a failing test handed
to /fix.

## Repo conventions and test command (detect, never assume)

Use repo-relative paths only; this works on Windows, macOS and Linux, in a repo with no
`CLAUDE.md`, `AGENTS.md` or `docs/`. Target = `git -C <dir-of-changed-files> rev-parse
--show-toplevel`, not the shell's directory; one run per git root. Read `CLAUDE.md`, `AGENTS.md`,
`CONTRIBUTING.md`, `README.md` if present — **their rules override this skill.** Their absence is
normal; fall back to generic defaults, never another project's conventions.

**Test command, in order (state which source you used):** a command the user gave → the repo's
docs → `package.json` scripts (`test:unit`, else `test`; package manager from the lockfile) → the
language default (`pytest`, `go test ./...`, `cargo test`, `dotnet test`, `bundle exec rspec`,
`mvn test` / `gradle test`, `node --test`) → **ask the user.** Never report a suite green when
nothing ran. Browser/E2E checks run only if the repo has that setup; otherwise skip and say so.
Write-ups go where the repo keeps them, else in the commit message body. Protected by default:
secrets only (`.env*`, key/cert files, service-account JSON) plus anything the repo's docs list.

## Protocol

### 0. Mode

| Mode | Trigger | Emphasis |
|---|---|---|
| **author** | new/changed code with thin tests | cover → write → (audit if asked) |
| **audit** | "are these tests good / what do they miss" | §4 audit + §5 mutation probe on the existing suite |
| **repro** | a reported bug | a failing test capturing it, then /fix |
| **parity** | a refactor | same inputs → same outputs and throws, before vs after |
| **verify-real** | "make sure it works for real" | §6 live / real-boundary is the deliverable |

### 1. Spec

What the test asserts against, independent of the implementation: acceptance criteria → type
contract → schema constraints. No spec? State the one you're testing against before writing.

### 2. Cover the behaviors the change touches

List the behaviors the change touches and the boundary each crosses. Add null/empty/malformed/
concurrent cases where they are plausible. **Cross-tenant cases (foreign credential → zero rows /
403) only when access is touched.** Mark anything a mock can't catch as `integration` or `live`.

### 3. Author, red-green proven

Each test: observed **failing** first with the expected symptom (or against a deliberate break),
then passing; deterministic (inject clock/random/network); expected value from the spec; a case
that genuinely can't be tested gets a visible `// SKIP: <reason>`. Match the repo's harness. The
full-suite run goes through the repo's gate script where one exists.

### 4. Audit the tests (audit mode, or when asked)

The critic gets the spec, the test source, the impl diff and the T-rubric; it is **not told the
suite is green** — its question is "would these still pass if the implementation were WRONG?"
Each finding names a T-id, `file:line`, and the **surviving mutation** (the concrete impl change
the test fails to catch). One rework round, then report what remains.

**T-rubric:** T-01 theater / mutation survivor · T-02 asserts impl not spec · T-03 mocks the
boundary the bug lives in · T-04 happy path only · T-05 silent skip · T-06 over-fitted to one input
· T-07 tautological (expected computed by the impl's own code) · T-08 non-deterministic · T-09
wrong layer / stale tree / unconfirmed verdict · T-10 floor-blind regression. Also flag tests that
pin doc/prompt wording or guard hypotheticals — recommend deletion.

### 5. Mutation probe (audit mode, opt-in)

For the riskiest 1–3 behaviors, name a concrete mutation (flip `>`/`>=`, drop a guard, return
`null`, weaken an auth check) and confirm at least one test fails for each. **Run probes in a
scratch worktree, never the shared tree** — a neighbor's uncommitted edit corrupts the result in
both directions.

### 6. Live and real-boundary proof

Pick the highest-value case a mock can't cover and **run it**: an integration test against the
real dev DB (the insert that lands, the constraint that rejects, the RLS read that returns zero),
or a live run on the real surface. For screens: log in, open the changed screen, **operate every
new or changed control** (click, drag, read labels), screenshot each state — changed UI only;
unchanged surfaces are covered by code/data tests. For a chat or agent feature: a real conversation on the
real channel, judged by the reply itself. If it can't run here, say plainly which boundary is unproven and give the command.

### 7. Floor-based regression + report

Run the detected suite (or the repo's gate script). Separate the pre-existing/environmental floor; the gate is **no NEW failures**;
zero tests run is INVALID. Report: behaviors covered and at which layer, tests added + red-green
proof, audit findings and surviving mutations (if run), the live result, regression floor vs new,
net lines added/removed, and the honest residual risk.

### 8. Commit locally if the user asked; ask before pushing

Explicit file names, never `git add -A`, no hook bypass. A test that found a bug is marked per repo
convention or handed to /fix — never commit a passing test over a known defect.

## Orchestration boilerplate (illustrative)

```js
const WORKER_MODEL = 'sonnet'   // cheap/fast tier — use whatever your harness offers
const STRONG_MODEL = 'opus'    // strong tier for the reviewer
const AREAS = [ /* behaviors the change touches */ ]
const written = await parallel(AREAS.map(a => () => agent(
  `${CAVEMAN_ULTRA}\nWrite red-green-proven tests for: ${a}. Expected values from the spec.`,
  { label: `author:${a}`, model: WORKER_MODEL })))
// Audit mode only: one critic on STRONG_MODEL with the spec, test source, impl diff and T-rubric.
```

## Auditing an EVAL (when the subsystem has one)

An eval is a test. Would it go RED on the regression it exists to catch (revert the fix, re-run)?
Is the ground truth independent of the system under test? Did the SUT actually execute through the
production path (recorded `sut_model`), or did an agent reason over the fixtures? Against current
code? Were thresholds fixed before the run? An eval that cannot fail is as serious as a test that
cannot fail. Full rules: the `evals` skill.

## Anti-patterns

- "All green, ship it" over mocks that never failed.
- Asserting what the code does; generating the expected value with the impl's own helper.
- Mocking the DB/RLS/env and calling it tested.
- Tests that pin prompt/doc wording or guard hypotheticals.
- "Panel exists, CLEAN" — a screenshot of a closed control after a change to it.
- Letting the critic see "the suite passes".
- Trusting a verifier or regression verdict without a ground-truth check.

## Operate from the Product First Principles

Read `${CLAUDE_PLUGIN_ROOT}/docs/product-first-principles.md`. Testing serves "measure what
we value": tests assert the value the PRD promised, not just code paths. For AI behavior,
route to the evals skill — graded eval sets with thresholds are the test suite there, and
the same red-green discipline applies (a new AI behavior gets a failing eval first).
