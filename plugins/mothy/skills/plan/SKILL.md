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

> **Adding a MANDATORY line requires deleting or merging one.** Incident stories go in fix-logs,
> not here. Eval rules: the `evals` skill.

## 0. Simplicity first

Before any squad runs, answer in the brief:
1. **What can we drop?** Question each requirement; each names the person it serves, or goes.
2. **What already exists?** An existing tool, module, sheet + routine, or config that does it.
   Triage: already satisfied > obsolete > config/doc change > smallest change at an existing
   choke point > new module.
3. **Trust the model.** Plan code only for people/safety rules (identity, who may see/do what,
   confirmed origins, secrets, confirmation for destructive/bulk acts, audit). Where code can't
   tell, the model decides or asks — no planned refusals.
4. **No new gate, kill switch, budget or monitor** without a named incident and a named person.
5. **Live first.** Every checkpoint ends with a live run on the real surface.

## Sub-agent preamble and models

Every `agent()` prompt starts with `CAVEMAN_ULTRA`:

```js
const CAVEMAN_ULTRA = `
RESPONSE MODE: ultra caveman. Drop articles, filler, pleasantries. Fragments OK.
Technical terms exact. Schema values exact.
CALIBRATION IS CONTENT, NOT FILLER. Keep qualifiers, severity and confidence.
Report only points that change the decision, worst first.
Pattern: [thing] [action] [reason]. [next].`
```

**Model tiering (by role, not by name):** role agents on the cheap tier; architecture/security
lenses and the plan reviewer on the strong tier (a different family from the drafters when
available); synthesis is the orchestrator's. Don't assume a specific model exists.

## Orchestration shape

**Preferred when the harness supports it:** run the squad as a background workflow, all role
agents in parallel.

**Fallback when it does not:** run the role passes **sequentially in one
session**, each still planning *independently* — do not show a role the previous
role's plan; that independence is the whole point. Nothing here requires a Workflow tool.

## When to use

`/plan <topic>`, bare `/plan` (latest substantive request), "have a team plan this". Not for
lookups or single-step tasks — answer inline.

## Protocol

1. **Identify the task** — args first, else the latest substantive request.

2. **Size the squad by stakes × uncertainty.** Default 2–3 agents: one merged **problem + options**
   lens (product + discovery), one merged **design + change list** lens (architecture + build), plus
   **test** when there is a test surface. Add separate strong-tier **security** / **architecture** only
   when stakes or uncertainty are high. **Merge, don't spawn:** an agent that sees the same evidence
   toward the same objective as one already spawned is merged.

### Role vocabulary (use the repo's `AGENTS.md` role map if it has one)

| Role | Responsibility |
|---|---|
| product | JTBD, PRDs, priority stacks |
| discovery | research → structured findings |
| architecture | ADRs, diagrams, API contracts |
| ux-designer | chat UX, message format, workflow review |
| build | code to spec, file-by-file change list |
| validate | pass/fail QA |
| security | threat model, access, secrets |
| test | live proof per checkpoint, failing tests for deterministic logic |
| docs | README, changelogs, ADRs |
| github | PRs, issues, releases |

3. **Build one self-contained brief:** current state, constraints (the repo's `CLAUDE.md` / `CONTRIBUTING.md` if present), any proposed
   solution with an invitation to challenge it, the §0 answers, and what to return.

4. **Confirm the target is deployed before planning work to harden it.** When the plan's value
   rests on an existing mechanism being LIVE (a patch applied, a cron armed, a flag on, a consumer
   reading), record the command run and what it returned, verbatim. Unreadable is not deployed. An
   inert target makes "make it live (or prove it shouldn't be)" the first unit. Read version and
   provenance facts from the tree the change lives in, and name that tree with the value.

5. **Spawn all role agents in parallel** (see Orchestration shape) (they must not see each other's drafts).
   Each gets `BRIEF + ## Your role: <name> + 6–10 role-specific questions`. Schema:

```js
// Fibonacci story points — perceived complexity, never days/hours/weeks. 21 must be split.
const PLAN_SCHEMA = {
  type: 'object',
  required: ['role', 'tldr', 'stance', 'what_can_we_drop', 'already_exists', 'design', 'concrete_steps', 'success_criteria', 'open_questions'],
  properties: {
    role: { type: 'string' }, tldr: { type: 'string' },
    stance: { enum: ['fully_agree', 'mostly_agree', 'partial_disagree', 'strongly_disagree'] },
    what_can_we_drop: { type: 'array', items: { type: 'string' } },  // requirements/steps to delete, with why
    already_exists: { type: 'array', items: { type: 'string' } },    // code/tools to reuse instead of build
    design: { type: 'string' },
    concrete_steps: { type: 'array', items: { type: 'object', required: ['step', 'complexity'],
      properties: { step: { type: 'string' }, touches_files: { type: 'array', items: { type: 'string' } },
        complexity: { enum: [1, 2, 3, 5, 8, 13, 21] } } } },
    success_criteria: { type: 'array', items: { type: 'string' } },  // each provable live
    open_questions: { type: 'array', items: { type: 'string' } }
  }
}
```

6. **Write the handoff file as soon as the squad is dispatched,** in the repo's plans/drafts
   convention (or the conversation if it has none; never create a directory it doesn't use): the
   ask, facts, any resume handle, and a next-step-on-resume list. Append each clarification answer
   as it arrives.

7. **Synthesize in the main thread** (you hold the conversation; sub-agents don't). Produce:
   consensus, conflicts + resolution, gaps, **what was dropped and why**, the final plan (ordered,
   owner per step, files, how each checkpoint is proven live, story points per chunk and total),
   the eval design when scope includes an LLM call (see below), and open questions for the user.
   Overwrite the handoff file with it.

8. **Plans over ~13 points get one strong-tier reviewer** of the synthesized plan: Q1 does it deliver
   what was asked with the smallest first slice? Q2 are the people/safety rules covered? Add a
   security reviewer only when the plan alters who can see or do what, touches secrets, or
   writes/destroys data. At most 5 findings; high needs a concrete failure written out.

9. **Present the synthesis**, not the raw drafts.

## Checkpoint granularity — reviewable early

A plan is done when it is REVIEWABLE EARLY, not when it is complete. (A 344-point plan whose
first checkpoint spanned ~20 units turned a two-hour feature into a night and a day.)

- **State a maximum unit count per checkpoint, and keep the FIRST one smallest.** A large first
  checkpoint is a defect; if the design truly can't produce a thin first slice, defend it.
- **Each checkpoint ends with a live run** a person can look at.
- **Cap any acceptance matrix to boundaries the slice actually crosses.**
- **Link the repo's test/gate cadence, never restate it.**
- **Separate "required for the pilot" from "required before anything is reviewable."**

## LLM-call evals

A prompt or model change is proven by running it live on the real path. Design a fixture eval only
for privacy, redaction, money, or a regression seen twice: ground truth, fixtures, and thresholds
fixed at plan time. Rules: the `evals` skill.

### Model provenance

- **No self-oracle:** ground truth is independent of the system under test.
- The system under test runs on the production model and real call path.
- **The agent RUNS the eval script; the agent is NOT the model.**
- Thresholds are fixed before the run. No eval batteries aimed at the live agent.

## Publishing the plan

Plans over ~13 points, or any plan that changes a user-visible surface, also ship as an
**annotated review artifact** — published after the reviewer clears, link handed over. The `.md`
handoff stays canonical for `/build`; both come from the same synthesis and re-publish to the SAME
URL when the plan changes. Smaller plans: the `.md` plus a short chat summary.

Layout: side-by-side boards (~1440 wide). Left, the thing itself (mock, sample conversation,
diagram or table, labeled ILLUSTRATIVE when sample data); pink numbered badges (`#D61F6E`) on the
exact spot each point is about; right, a "WHAT CHANGED" sidebar (was / now / why better). Boards:
**Start here** (the ask in the asker's words, jobs → step table, what's left alone, what is still
unknown — loudest), **Before and after** (with checkpoints and points), then one board per surface.

### Choose boards by what the plan changes

| The plan changes | Show |
|---|---|
| UI | a mock of each changed screen in the product's real design, only what changes |
| Chat, agents, tools | sample conversations with the tool call under each reply |
| Data and schema | tables, columns, who writes each, sample rows before/after |
| APIs | request/response examples, error cases, who may call what |
| Flows, jobs | a flow diagram, triggers, failure behavior, how anyone would notice |
| Permissions | a role-by-action table, including refusals |
| Migration or rollout | ordered steps, what rolls back, the point of no return |
| LLM behavior | the live proof, any eval fixtures and thresholds, which model serves |

Accuracy: read every source the requester gave (an unread one is listed as unread); use the
system's real vocabulary; sample data only (`[SAMPLE ACCOUNT]`, `[NAME]`); say the true state
(built / planned / waiting / unverified); plain language; story points only. Use the Design
(canvas) artifact type when available; otherwise one self-contained HTML file next to the `.md`.

## Orchestration boilerplate (illustrative)

```js
const WORKER_MODEL = 'sonnet'   // cheap/fast tier — use whatever your harness offers
const STRONG_MODEL = 'opus'    // strong tier for the reviewer
const ROLES = [ /* { name, focus: ['6-10 role-specific questions'] } */ ]
phase('Squad')
const drafts = await parallel(ROLES.map(r => () => agent(
  `${CAVEMAN_ULTRA}\n${BRIEF}\n## Your role: ${r.name}\n${r.focus.join('\n')}`,
  { label: `role:${r.name}`, schema: PLAN_SCHEMA, model: WORKER_MODEL })))
// Synthesis stays in the main thread. Plans over ~13 points: one reviewer on STRONG_MODEL.
```

## Blocking decisions go in a question widget

The user's decisions go in `AskUserQuestion`: recommendation first `(Recommended)`, context in the
question, each option's consequence and reversibility, one decision each. Two-way doors their intent
covers are yours — decide, log one line.

## Anti-patterns

- 11 agents on a 2-file change; two agents reading the same evidence toward the same objective.
- A plan that adds gates, switches, budgets or refusals with no named incident and person.
- A plan with no "what we dropped" and no "what already exists".
- A first checkpoint of many units with no live proof until the end.
- Scheduling units to harden a mechanism nobody confirmed is running.
- Reading a pinned version from whichever checkout is open.
- Letting a synthesizer agent write the final plan; dumping raw drafts on the user.
- A mock that invents statuses or screens the real system doesn't have.

## Operate from the Product First Principles

When planning product work, read `${CLAUDE_PLUGIN_ROOT}/docs/product-first-principles.md`
and let it bias the plan: think big, start small (smallest independently useful units
first); make reversible calls in the plan without ceremony, flag 1-way doors explicitly;
don't shop without a price tag (carry relative Fibonacci complexity per work unit, never
time estimates); measure what we value (the plan includes instrumenting the PRD's
self-measuring North Star metric, not just features). If the input is a PRD, its MoSCoW
job stories are the requirements contract — decompose them, don't reinvent them.
