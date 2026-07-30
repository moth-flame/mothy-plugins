---
name: audit
description: Read-only repo audit + prioritized improvement plan. Principal-engineer-grade analysis in four phases — Discovery & Mapping, evidence-based severity-rated Audit, Improvement Strategy, Detailed Task Plan. Every claim cited to file:line. Use when the user invokes /audit, says "audit this repo", "review the whole codebase", "what's wrong with this project", "give me a health grade", "where are the worst parts", or wants a prioritized refactor/cleanup plan. NEVER modifies code — analysis only. Pair with /plan or /build to act on findings.
metadata: { "openclaw": { "emoji": "🔍" } }
---

# audit — Repo Audit & Improvement Plan

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
2. That's all this skill needs. It is read-only by contract: it runs no tests and
   modifies no code, config, or docs.

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

> World-class principal-engineer audit. Four phases, **in order, no skipping ahead**. Ground every claim in real files — cite `path:line`. Can't verify → say so, never guess.
>
> **HARD CONSTRAINT: analysis only. Do NOT modify any code, config, or docs during the audit.** No edits, no writes except the final report artifact. If user wants fixes, point them to `/plan` + `/build` after.

## §0 — Scope & calibration (do this first)

1. **Target.** Default = current repo at CWD. If user names a path/subtree, scope there. Confirm scope in one line before starting if ambiguous.
2. **Calibrate to maturity.** Prototype ≠ production service ≠ published library. Don't recommend enterprise infra for a weekend prototype unless owner's goals demand it. Recommendations fit the existing culture, not fight it.
3. **Depth budget.** Large repo → go deep on the core 20% of code doing 80% of the work; note which areas got lighter review. Small repo → cover all.
4. **Output artifact.** Write final report to `docs/drafts/audit-<repo-or-scope>-<context>.md` (use a slug; no `Date.now()` — derive date from git or ask). This is the ONLY file the skill writes.

## §0.5 — Ultra caveman mode for sub-agents (MANDATORY when fanning out)

If you spawn audit sub-agents (§2.5), every `agent(...)` prompt prepends `CAVEMAN_ULTRA`. Caveman applies to **prose fields only** (`finding`, `why_it_matters`, `judgment`, `strength`). Structured fields stay exact — `file`, `line`, `severity` enum, `dimension`, code snippets, error strings: NEVER cavemanized.

```js
const CAVEMAN_ULTRA = `
RESPONSE MODE: ultra caveman. Drop articles (a/an/the), filler (just/really/basically/actually),
pleasantries, hedging. Fragments OK. Short synonyms (big not extensive, fix not "implement").
Technical terms exact. Code blocks unchanged. File paths exact. Line numbers exact. Enum values exact.
Pattern: [thing] [problem] [consequence]. [severity].
NOT: "I think this function might possibly have insufficient error handling which could..."
YES: "src/api/client.ts:142 no try/catch. Unhandled reject crashes worker. High."
`
```

The final report presented to the user stays normal prose — caveman only for sub-agent intermediate output.

---

## Phase 1 — Discovery & Mapping (read before judging)

Explore systematically BEFORE forming any opinion. Use `Explore`/`Glob`/`Grep`/`Read`. Cheap, parallel.

- Map directory structure. Identify project type, language(s), frameworks, runtime targets.
- Identify entry points, core modules, main data/control flow.
- Read manifests + lockfiles, build config, CI config, env/config files, docs (README, CONTRIBUTING, ADRs).
- Determine purpose: what it's for, intended users, apparent maturity (prototype / internal tool / production service / library).
- Note conventions already in use — naming, module boundaries, error-handling patterns, test style — so recommendations fit existing culture.

**Output — "Repo Map":** purpose, stack, architecture sketch, key directories (one line each), and anything that surprised you. Keep concise.

> Gate: do NOT start Phase 2 until the Repo Map exists. Judging before reading is the #1 failure mode.

---

## Phase 2 — Audit (evidence-based, severity-rated)

Audit each dimension below. For **every finding** record:
- **(a) what** you found
- **(b) where** — `file:line`
- **(c) why it matters** — concrete consequence, not a vague principle
- **(d) severity** — `Critical` / `High` / `Medium` / `Low`

### Dimensions

1. **Architecture & design** — module boundaries, coupling/cohesion, circular deps, leaky abstractions, god objects/files, layering violations, scalability bottlenecks.
2. **Code quality** — duplication, dead code, complexity hotspots (longest/most-branched fns), inconsistent patterns, error-handling gaps (swallowed exceptions, missing edge cases), type-safety holes.
3. **Security** — hardcoded secrets/creds, injection risks, unsafe deserialization, missing input validation, auth/authz weaknesses, outdated deps with known CVEs, overly permissive configs.
4. **Testing** — coverage gaps (esp. core business logic), test quality (assert behavior vs just execution?), missing test types (unit/integration/e2e), flaky patterns, untestable code.
5. **Performance** — N+1 queries, needless allocations/copies, blocking calls in async paths, missing caching/indexing, unbounded growth (memory, files, queues).
6. **Dependencies** — outdated, unmaintained, duplicated, heavy packages; license risks; lockfile hygiene.
7. **DevEx & operations** — build/setup friction, CI/CD gaps, missing lint/format enforcement, logging/observability quality, error reporting, deployment story.
8. **Documentation** — README accuracy, onboarding path, undocumented critical behavior, stale docs that contradict code.

### Rules for Phase 2

- **Prefer 15 high-confidence findings over 50 speculative ones.**
- **Label facts vs judgments.** Fact = "this fn has no error handling: `src/api/client.ts:142`". Judgment = "this module's responsibilities feel unclear". Mark which is which.
- **List what the repo does well.** Strengths decide what to preserve.
- **Surface the ugly parts.** Don't soften the worst issues — call out what needs utmost priority.
- If a dimension is healthy, say so in **one sentence** and move on. Don't pad.

### §2.5 — Parallel dimension fan-out (optional, for medium/large repos)

For a large repo, run the 8 dimensions as parallel sub-agents via the **Workflow** tool — each gets the Repo Map + scope, returns findings as structured JSON, then optionally adversarial-verify high-severity findings before they make the report. Only do this when the user opted into multi-agent orchestration (see Workflow tool rules) OR the repo is large enough that serial review would be shallow. Otherwise audit serially yourself — it's faithful and avoids spawn cost.

Verifier isolation rule still applies: a `verify:` sub-agent confirming a finding sees only `{the claim, the cited file:line slice, the rubric}` — NOT the finder's reasoning. Skeptic prompt: "try to refute this finding; default to refuted if the cited line doesn't support it."

Finding schema when fanning out:
```
{ dimension, finding, file, line, why_it_matters, severity, kind: "fact"|"judgment", confidence }
```

**Output — "Audit Report":** findings grouped by dimension, sorted by severity within each, plus a **Strengths** section.

---

## Phase 3 — Improvement Strategy

Synthesize the audit into strategy:

- Identify the **3–5 themes** explaining most findings (e.g. "no enforced boundaries between layers", "error handling is ad hoc").
- For each theme: a **target state** and the **principle** behind it.
- State explicit **trade-offs** — what you recommend NOT fixing and why (effort vs payoff, risk, project maturity).
- Define **"done"** — measurable signals (e.g. "CI fails on lint errors", "core-module test coverage ≥ 80%", "zero Critical findings").

---

## Phase 4 — Detailed Task Plan

Convert strategy into an execution plan.

**Each task includes:**
- Title + one-paragraph description
- Files/areas affected
- Acceptance criteria (how we verify done)
- Effort: `S` (<2h) / `M` (half-day) / `L` (1–2 days) / `XL` (needs breakdown)
- Risk of the change itself (could it break things?)
- Dependencies on other tasks

**Order into milestones:**
- **Milestone 0 — Safety net:** anything needed before refactoring safely (tests around critical paths, CI gates, backups).
- **Milestone 1 — Critical fixes:** security + correctness.
- **Milestone 2 — High-leverage:** changes that make all future work easier.
- **Milestone 3 — Quality & polish:** remaining medium/low worth doing.

- **Flag quick wins separately** — high impact, `S` effort — so they can be done immediately.
- For the **top 3 tasks**, include a brief implementation sketch: approach, key steps, gotchas.

---

## Final Deliverable — single document, these sections in order

1. **Executive Summary** — ≤10 sentences: overall health grade **A–F** with justification, top 3 risks, top 3 opportunities.
2. **Repo Map** (Phase 1)
3. **Audit Report** (Phase 2 — findings + Strengths)
4. **Improvement Strategy** (Phase 3)
5. **Task Plan** (Phase 4 — milestones + task table + quick wins)
6. **Open Questions** — what you need from a human: product intent, deprecation candidates, performance targets.

Write it to `docs/drafts/audit-<slug>.md` AND surface the Executive Summary + quick wins inline in the chat.

---

## Constraints (repeat — these override convenience)

- **Do NOT modify code during the audit.** Analysis only. The report file is the only write.
- **Don't pad.** Healthy dimension → one sentence, move on.
- **Calibrate to maturity.** No enterprise infra for a prototype unless goals demand it.
- **Ground every claim** in a real `file:line`. Unverifiable → say so explicitly.
- Large repo → depth in the core 20%; note which areas got lighter review.
