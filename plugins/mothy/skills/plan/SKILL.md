---
name: plan
description: Multi-role independent planning then synthesis. Spawn parallel sub-agents one per relevant role (architecture, product, discovery, design/UX, security, build, test, etc.), each plans the task independently with a shared brief, then synthesize their plans into a final unified plan. Use when the user invokes /plan [topic], or says "plan this", "have a team plan this", "get a panel to think about this", "spawn a roundtable". For comprehensive design decisions where multiple lenses add signal. Pair with /build to execute the plan.
metadata: { "openclaw": { "emoji": "🧠" } }
---

# plan — Multi-role planning protocol

<!-- BEGIN desktop-preflight — plugin-distribution copy ONLY. PRESERVE when re-syncing
     from the Mothy repo's .claude/skills/. The Mothy repo copies run on Agent37 and in
     a checked-out repo, where these conditions are already true; this block exists for
     teammates invoking the skill from the Claude desktop app. -->

## §0.0 — Preflight: check the workspace, then explain (MANDATORY — runs before anything else)

**Do this first — before reading files, before spawning any agent.** Many people reach
this skill from the **Claude desktop app**, where a session may not be pointed at a code
project at all. Do not start and then fail confusingly: check, and if something's missing,
explain it plainly.

1. **A real project folder is open** — source files you can read, not an empty or
   scratch directory.
2. That's all this skill needs. It only reads and writes a plan; it runs no tests and
   changes no code.

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

> **Repo-agnostic and OS-agnostic.** Nothing here assumes a particular project
> layout, operating system, absolute path, or role registry. It reads the repo's
> own conventions **if present** and falls back to sensible generic defaults
> otherwise. It works on Windows, macOS, and Linux, in a repo with no
> `CLAUDE.md`, no `AGENTS.md`, and no `docs/` directory.

## §0.1 — Repo conventions: detect, do not assume

**Use repo-relative paths only** — never absolute paths.

Before building the brief, read these files **if present**: `CLAUDE.md`,
`AGENTS.md`, `CONTRIBUTING.md`, `README.md`, and anything they point at. **Their
rules OVERRIDE this skill wherever they conflict**, and their contents belong in
the shared brief (§3) so the squad plans within the real constraints.

**These files are OPTIONAL and their absence is normal.** A repo with none of
them is not misconfigured — do not refuse, do not ask the user to create them,
and do not import another project's conventions in their place.

| Thing the plan needs | Detect from | Fallback when absent |
|---|---|---|
| **role map** | `AGENTS.md` if present | the plain roles in §2 |
| **test / regression command** (so the plan's steps are runnable) | §0.2 detection order | ask the user, or state the plan assumes an unknown command |
| **planning-artifact location** | a drafts/planning convention named in the repo's docs | keep the plan in the conversation, or write it wherever the user asks; never invent a doc tree the repo doesn't use |
| **hard rules** (protected files, review gates, commit policy) | the repo's docs | secrets are protected; commit locally and ask before pushing |

## §0.2 — Test command detection (never hardcode one in a plan)

When a plan step says "run the tests," name the command the repo actually uses.
Resolve it in this order and state which source you used:

a. **An explicit command the user gave** — always wins.
b. **The repo's own docs** — `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`.
c. **`package.json` `scripts`** — prefer `test:unit`, else `test`; package manager from the lockfile (`pnpm-lock.yaml` → `pnpm run`; `yarn.lock` → `yarn`; `package-lock.json`/none → `npm run`).
d. **Language-native default:** `pytest` · `go test ./...` · `cargo test` · `dotnet test` · `bundle exec rspec` · `mvn test` / `gradle test` · `node --test`.
e. **If none can be determined, ASK the user** rather than guessing.

Only include a browser/E2E step if the repo actually has that setup (config +
dependency + specs). If it doesn't, leave it out and say the plan has no browser
verification step because the repo has no browser test setup.

## §0.3 — Orchestration shape (preferred, with a plain fallback)

**Preferred when the harness supports it:** run the squad as a detached
background workflow — all role agents in parallel, resumable, surviving a
dropped connection.

**Fallback when it does not:** run the role passes **sequentially in one
session**, each still planning *independently* — do not show a role the previous
role's plan; that independence is the whole point. Every guarantee survives:
independent lenses, constrained role focus, one synthesized plan at the end.
**Nothing here requires a Workflow or Task tool.** What you lose is parallelism
and resume-on-disconnect.

**Durability is useful but optional, and degrades gracefully.** A /plan run
spans three fragile moments: the squad fans out, the user answers clarifying
questions, you synthesize.

1. **Persist the run's state if the repo has a place for it.** If the repo uses a drafts/planning directory, write `<that-dir>/<YYYY-MM-DD>_<topic-slug>-plan.md` the moment the run starts. If it has no such convention, keep the same content in your working notes and offer to save it where the user wants. **Never create a doc tree the repo doesn't use, and never stall because a directory is absent.**
2. **When kept, the handoff file holds:** the ask (brief, condensed) and any proposed approach being challenged; **locked decisions** — every answer the user has given, verbatim; verified current-state facts the squad was given (so a cold restart doesn't re-explore); a resume pointer if the harness gave you one; a "next step on resume" checklist.
3. **Persist the user's answers the instant they arrive.** Clarifying answers are decisions; a transcript is not durable across a cold restart.
4. **Resume contract.** Mid-run in the same session → resume the workflow if the harness offers it; completed agents return cached results. Cold restart → read the handoff file (or your notes), re-run or read the completed role plans, then synthesize.
5. **On synthesis, replace the handoff content with the final plan** so it becomes a self-contained artifact `/build` can read directly. Keep the locked-decisions section.

## §0.4 — Compact sub-agent output (recommended)

Prepend the `CAVEMAN_ULTRA` preamble to sub-agent prompts. It applies to prose
fields only: `tldr`, `reasoning`, `design`, `step`, `rationale`, `risk`,
`mitigation`, `success_criteria` entries, `open_questions` entries,
`priority_reorder`. Enums, file paths, numbers, and schema field names stay
exact.

```js
const CAVEMAN_ULTRA = `
RESPONSE MODE: ultra caveman. Drop articles (a/an/the), filler (just/really/basically/actually),
pleasantries, hedging. Fragments OK. Short synonyms (big not extensive, fix not "implement").
Technical terms exact. Code blocks unchanged. File paths exact. Enum values exact.
Pattern: [thing] [action] [reason]. [next].
NOT: "I think the architecture should probably introduce a new abstraction layer that..."
YES: "New abstraction layer. Decouple X from Y. Reason: Y churn high."
`
```

Your final synthesis (presented to the user) stays in normal prose — the
compression is for sub-agent output only.

## §0.5 — Model tiering (by role and relative cost, not by name)

Match the model to the job rather than to a fixed lineup:

- **Cheap/fast worker tier** — the independent role plans. Many parallel calls, each well-scoped by its focus block.
- **Strong/expensive critic tier** — the pre-synthesis conformance cross-check (Protocol 5.5), the synthesis and conflict resolution, and any adversarial review of the resulting plan. Few calls, highest leverage.

The conformance cross-check is a distinct role from the synthesis, not an
earlier draft of it: it maps where the role plans contradict each other and
which brief requirements no role addressed, and it never authors the plan.
Synthesis stays yours. Run it as its own agent even when only one tier is
available.

Do not assume a specific model is available. If only one tier exists, run
everything there and say so.

## §0.6 — LLM-call eval gate (when the plan includes an LLM call)

If the plan introduces or changes a prompt, a worked example, a model/provider
choice, or LLM call parameters, the plan MUST include an eval gate as a first-class
step — not an afterthought:

1. **An eval with fixtures and a runner**, built in the same work if the subsystem has none.
2. **Ground truth INDEPENDENT of the system under test — the no-self-oracle prohibition.** Never grade a prompt's output using the same subsystem being changed. (Illustration: an eval that scores a redactor's output by re-running that same redactor stays green straight through a total redactor regression.)
3. **Thresholds fixed BEFORE the run** — decided in the plan, not tuned afterwards to whatever the new output happens to score.
4. **A recorded result** — metric values, fixture set, ground-truth source, threshold, pass/fail — as an acceptance criterion of the unit that ships it.

### Model provenance — which pool pays, and for what

An eval has three distinct roles, and they have OPPOSITE right answers. Conflating
them is how a cheap eval quietly becomes a fake one.

| Role | Which model | Which pool pays | Why |
|---|---|---|---|
| **System under test** | PRODUCTION parity — the model the shipped code actually calls | whatever production costs | Substituting changes *what you are measuring* |
| **Judge / grader** | A subscription-backed model (one you already pay a flat rate for) — prefer a STRONG one | the flat-rate pool | Ground truth must be independent of the SUT. Stronger is *better* here; it is the structural opposite of a self-oracle |
| **Fixture / adversarial-input authoring** | Subscription-backed | the flat-rate pool | No parity concern at all — red-teaming a prompt is exactly what a strong model is for |

**Never spend metered per-call API budget on the judge or the fixtures.** That is
what a flat-rate subscription is for. And where production is already a local or
otherwise free model, the SUT costs nothing either — the cheapest option and the
highest-parity option are the same option, so there is no tradeoff to optimize.

**SUT substitution is DEFAULT-DENY.** If production parity genuinely cannot be
had, record ONE line naming (a) the property being measured, (b) that the
substitute is weaker-or-equal to production, and (c) that the property is not
parity-locked. The *direction* is the whole argument: a STRONGER substitute
biases optimistic — green tells you nothing about production — while a WEAKER
substitute biases pessimistic, so a green there is *stronger* evidence than
production would have given.

**Parity-locked properties — never substitute, at any price.** These are
properties of the model×prompt PAIR, not of the prompt:

- prompt-injection resistance
- instruction-following fidelity
- output-format / JSON compliance
- degeneracy and looping

A stronger model masks the defect completely. A small model's rewrite degeneracy
is invisible on a large one; an injection fixture that a frontier model shrugs
off says nothing about the small model actually serving the call.

**The agent RUNS the script; the agent is NOT the model.** An agent told to eval
"on the subscription" will read the fixtures, reason about them itself, and
report metrics *with the production code path never executed*. That is a
FABRICATED eval, and in a report it is indistinguishable from a real one — the
same decoupling as the self-oracle. Subscription inference may serve the judge
and author the fixtures; the SUT always goes through the real production call
path (real provider chain, real prompt, real runner script).

**Report `sut_model`.** Every eval result records which model actually served the
system under test. An eval that cannot say what served it is not evidence. This
is also the check that catches a STALE-CODE run: an eval executed against a
checkout or host that has not picked up the change grades the OLD behavior and
reports a meaningless green.

**Two tiers.** Subscription-backed judge in the inner loop (every commit, drift
detection, fixture wiring). Parity SUT at the ship gate, and on ANY
model/provider/parameter change.

**Cost note — the model choice is not the biggest lever.** What the eval runs
*against* usually dominates. An eval battery pointed at a live production agent
carrying its full tool schema pays that schema on every single call; pointing it
at a dedicated eval twin instead can save an order of magnitude more than any
model swap. Give that twin EMPTY fallbacks, so an eval fails loud rather than
silently switching models mid-battery.

## When to use

The user says one of:
- `/plan <topic>` (with topic args)
- `/plan` alone — use the most recent substantive request in the conversation as the topic
- "have a team plan this", "spawn a roundtable", "get a panel to think about X"

For comprehensive design / architecture decisions where multiple role lenses
each add signal. Not for simple lookups or single-step tasks.

## Protocol

1. **Identify the task** — explicit args take priority; else use the most recent substantive user request in the conversation.

2. **Pick roles.** **If the repo has an `AGENTS.md` (or equivalent) role map, use it — it overrides this list.** Otherwise use these plain roles and pick the 4–8 whose lens actually overlaps the task:
   - **architecture** — component boundaries, API contracts, data flow, diagrams, ADRs
   - **product** — jobs-to-be-done, user-visible failure modes today, priority ranking with a defended order
   - **discovery** — external option comparison, matrices, a recommendation
   - **design / UX** — how the change surfaces to the user, per-surface formatting, correction flows
   - **security** — threat model, access control/isolation, PII, prompt injection, audit trail
   - **build** — file-by-file change list, migration, rollout phasing, rollback
   - **test** — a failing test per move (red-green), coverage/regression metrics, a manual runbook
   - **docs** — when a knowledge artifact is the deliverable
   - **release** — when shipping requires PR/release planning

   Drop irrelevant roles: a 4-role squad of the right lenses beats a 10-role squad of bystanders.

3. **Build a shared brief** — a single self-contained string that includes:
   - Current state of the system / the problem
   - Constraints from the repo's own docs (§0.1) and prior conversation
   - Any proposed solution already on the table, with an explicit invitation to challenge it
   - Hard rules that apply (protected files, review gates, red-green TDD, the detected test command from §0.2)
   - "What to return" instructions

4. **Spawn one agent per role, all in parallel** (or sequentially and independently in the fallback), with structured output. Each agent gets `${BRIEF} + ## Your role: <name> + <role-specific focus>`. Suggested schema:

```js
// Fibonacci complexity scale — NOT days.
// Story points convey perceived complexity, which is the signal that survives
// contact with an unfamiliar codebase; wall-clock estimates do not.
//
//  1  = trivial — one-line change, rename, copy tweak
//  2  = simple — one file, well-understood, no design
//  3  = small — multi-file but mechanical, clear pattern to follow
//  5  = medium — multi-component, some unknowns, a few design choices
//  8  = large — cross-cutting, real design work, new abstraction
// 13  = very large — multi-system, hidden coupling, needs an ADR
// 21  = epic — should be split before estimating
const COMPLEXITY = [1, 2, 3, 5, 8, 13, 21]

const PLAN_SCHEMA = {
  type: 'object',
  required: ['role', 'tldr', 'agree_or_disagree', 'design', 'concrete_steps', 'risks', 'success_criteria', 'open_questions'],
  properties: {
    role: { type: 'string' },
    tldr: { type: 'string' },
    agree_or_disagree: {
      type: 'object',
      required: ['stance', 'reasoning'],
      properties: {
        stance: { type: 'string', enum: ['fully_agree', 'mostly_agree', 'partial_disagree', 'strongly_disagree'] },
        reasoning: { type: 'string' }
      }
    },
    design: { type: 'string' },
    concrete_steps: {
      type: 'array',
      items: {
        type: 'object',
        required: ['step', 'rationale', 'complexity'],
        properties: {
          step: { type: 'string' },
          rationale: { type: 'string' },
          touches_files: { type: 'array', items: { type: 'string' }, description: 'repo-relative paths only' },
          complexity: { type: 'number', enum: [1, 2, 3, 5, 8, 13, 21] }
        }
      }
    },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['risk', 'mitigation'],
        properties: {
          risk: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
          mitigation: { type: 'string' }
        }
      }
    },
    success_criteria: { type: 'array', items: { type: 'string' } },
    open_questions: { type: 'array', items: { type: 'string' } },
    priority_reorder: { type: 'string' }
  }
}
```

**Sizing rules for sub-agents (include verbatim in the brief):**
- Use Fibonacci story points (1, 2, 3, 5, 8, 13, 21) — never days, hours, or weeks.
- Estimate perceived complexity, not duration. If two steps both feel "medium" with comparable unknowns, both are 5. If one has more hidden coupling, bump it to 8.
- Anything 21 must be split before reporting back.
- Synthesis presents chunk totals as story-point sums, not time.

4.5. **Persist the run state as soon as it starts (§0.3)** — the ask, the verified facts, any resume pointer, and a next-step-on-resume checklist. Append every clarification answer as it arrives. If the repo has no planning-doc convention, keep this in your notes rather than inventing a directory.

5. **Write role-specific focus blocks** — each agent's `focus` is 6–10 specific bullet questions for that role. Don't let "architecture" plan everything; constrain each role to its domain, or you get N identical generic plans.

5.5. **Cross-check the role plans against the brief — the conformance reviewer (MANDATORY).** When the plans come back and BEFORE you synthesize, run one agent whose only job is: *does this set of plans actually answer the brief, and do the plans agree with each other?*

   - **A separate role from synthesis, and it never authors the plan.** It produces a map — nothing more. You synthesize, because you carry the conversation and it does not.
   - **Label it `conformance:`** — never `verify:` / `review:` / `critique:`. Those labels belong to the isolated adversarial critics elsewhere in this toolchain (in /build and /fix a verifier is shown a diff, a rubric and types and deliberately nothing else, so that it cannot rationalize "the tests pass, must be fine"). This agent is the opposite by design: **it is handed the brief, because "was the ask answered" is a question you structurally cannot ask of a reviewer who never saw the ask.** Seeing the requirements is correct here, not a bias leak — and the labels stay distinct so nobody later "helpfully" feeds an isolated verifier the requirements too.
   - **Strong/expensive critic tier** (§0.5) — reading N plans against a brief and finding the contradiction nobody stated is exactly where a weak model produces a summary instead of a cross-check.
   - **Inputs:** the shared brief (requirements + constraints), every role plan in full, and any decisions already locked.
   - **Output: a severity-ranked triage, worst first** — (a) where two roles propose incompatible things, naming both; (b) which brief requirements NO role addressed; (c) which plans are thin or hand-wave the hard part. Plus a short brief you read FIRST, so synthesis starts from a conflict map instead of you rebuilding it by hand from seven documents.
   - **No veto, no authorship.** It hands you findings; you resolve them and own the final plan. But an unresolved `critical` finding — a requirement nothing covers, a contradiction nobody picked — blocks handing the plan to /build as final.

   **What it is actually for: a squad that reports done without answering the ask.** Every role can return a competent, internally-consistent plan for the slice it was given and still, collectively, leave the actual request unaddressed — because no single role was ever asked to hold the whole brief. This agent is.

6. **Synthesize yourself** — when the role plans come back, YOU review them, starting from the conformance brief (5.5) rather than rebuilding the conflict map by hand. Do NOT delegate synthesis to another agent: you carry the full conversation context, the sub-agents do not. Produce:
   - **Consensus** — what most roles agreed on
   - **Conflicts** — where roles disagreed, and the resolution, with reasoning
   - **Gaps** — what no role covered that still matters
   - **Final plan** — ordered, concrete, ready to execute. Include who owns each step, repo-relative file paths, test names, the detected test command, per-chunk story-point complexity, and a per-task total
   - **Open questions for the user** — decisions only they can make

   Present complexity in story points (1–21 Fibonacci). Never present days, hours, or weeks.

7. **Present the synthesis, not the raw role plans.** The user asked for the final plan, not the deliberation transcript. Quote a specific plan only when it had a detail worth surfacing verbatim.

## Orchestration boilerplate (illustrative)

Illustrative, not required — run the roles sequentially and independently if the
harness has no parallel sub-agents (§0.3).

```js
export const meta = {
  name: 'squad-<short-topic-slug>',
  description: 'Multi-role independent planning for <topic>',
  phases: [{ title: 'Independent planning' }, { title: 'Conformance' }]
}

const BRIEF = `<full self-contained context — agents see no other conversation>`

const ROLES = [
  { name: 'architecture', focus: `...` },
  { name: 'product', focus: `...` },
  // ...
]

const PLAN_SCHEMA = { /* as above */ }

phase('Independent planning')
const plans = await parallel(ROLES.map(({ name, focus }) => () =>
  agent(`${CAVEMAN_ULTRA}\n\n${BRIEF}\n\n## Your role: ${name}\n\n${focus}\n\nPlan independently.`, {
    label: name,
    schema: PLAN_SCHEMA
  })
))

// Pre-synthesis conformance cross-check (Protocol 5.5). Sees the brief ON PURPOSE —
// "was the ask answered" needs the ask. Strong critic tier if available (§0.5).
// Label `conformance:`, NEVER `verify:`. It maps conflicts; it never writes the plan.
phase('Conformance')
const conformance = await agent(
  `${CAVEMAN_ULTRA}\n\nConformance reviewer — cross-check ALL role plans vs the brief and vs each other. ` +
  `Do NOT write a plan.\n\nBRIEF:\n${BRIEF}\n\nROLE PLANS:\n${JSON.stringify(plans.filter(Boolean))}\n\n` +
  `Emit worst-first: role-vs-role contradictions (name both), brief requirements NO role addressed, ` +
  `plans that hand-wave the hard part. You have NO veto — this is a triage for the orchestrator.`,
  {
    label: 'conformance',
    phase: 'Conformance',
    schema: {
      type: 'object',
      required: ['conforms', 'orchestrator_brief', 'findings'],
      properties: {
        conforms: { type: 'boolean' },
        orchestrator_brief: { type: 'string' },
        findings: {
          type: 'array',
          items: {
            type: 'object',
            required: ['severity', 'kind', 'detail'],
            properties: {
              severity: { enum: ['critical', 'high', 'medium', 'low'] },
              kind: { enum: ['contradiction', 'unaddressed_requirement', 'thin_plan'] },
              roles: { type: 'array', items: { type: 'string' } },
              detail: { type: 'string' }
            }
          }
        }
      }
    }
  }
)

return { plans: plans.filter(Boolean), conformance }
```

If the harness returns a run handle, capture it and persist it with the run
state (§0.3) before doing anything else — the run is detached and resumable.

## Rules

- **Detect, don't assume** (§0.1). Read the repo's `CLAUDE.md` / `AGENTS.md` / `CONTRIBUTING.md` / `README.md` **if present**; their rules override this skill and belong in the brief. Their absence is normal.
- **Repo-relative paths only.** No absolute paths, no OS assumptions — plans must be executable on Windows too.
- **Never hardcode a test command** in a plan step (§0.2) — name the one this repo actually uses, or ask.
- **Parallel, not sequential — and independent either way.** Role agents MUST not see each other's plans during the planning stage; independence is the entire value. In the sequential fallback, still withhold prior plans.
- **Self-contained brief.** Sub-agents have no conversation history. The brief includes everything they need, or they will hallucinate it.
- **Constrain each role.** Role focus = specific bullet questions, not "plan this."
- **Conformance cross-check before synthesis** (Protocol 5.5). One agent, labeled `conformance:` and never `verify:`, reads the brief alongside every role plan and answers the question no isolated critic can — was the ask answered, and do the plans agree? It is given the requirements on purpose; that is its measuring stick. It never authors the plan and has no veto, but an unresolved `critical` finding blocks handing the plan to /build as final.
- **You synthesize.** The final plan is your job, not a synthesis agent's — you have the context they don't.
- **Don't dump raw plans on the user.** The synthesis is the deliverable; mention specific dissents and gaps inline.
- **Skip if the task is trivial.** A single file read, a factual question, a status check — answer inline. A squad is for design-level decisions.
- **Include an eval gate when the plan touches an LLM call** (§0.6) — ground truth independent of the system under test, thresholds fixed before the run.
- **Plans stop at planning.** A plan does not commit, push, deploy, or migrate. Execution is /build, and it commits locally and asks before pushing.
- **Durable where possible (§0.3).** Persist the ask, the decisions, and the resume pointer; degrade to working notes when the repo has no planning-doc convention.

## Anti-patterns

- Ten agents on a two-file change. Pick 3–4.
- Sequential agents that can see each other's plans — the squad's whole value is independence.
- The same focus block for every role (returns N identical generic plans).
- Letting a synthesizer agent write the final plan — it doesn't have the conversation.
- Showing the user a raw JSON dump of every role plan.
- **Naming a test command the repo doesn't have**, so every downstream step is unrunnable.
- **Writing the plan into a directory convention the repo doesn't use**, or refusing to plan because `CLAUDE.md` / `AGENTS.md` is missing.
- Estimating in days/hours/weeks instead of complexity points.
