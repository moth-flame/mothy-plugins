---
name: plan
description: Multi-role independent planning then synthesis. Spawn parallel sub-agents one per relevant role (architecture, product, discovery, ux-designer, security, build, test, etc. — pick from AGENTS.md responsibilities), each plans the task independently with a shared brief, then synthesize their plans into a final unified plan. Use when the user invokes /plan <topic>, or says "plan this", "have a team plan this", "get a panel to think about this", "spawn a roundtable". For comprehensive design decisions where multiple lenses add signal. Pair with /build to execute the plan.
metadata: { "openclaw": { "emoji": "🧠" } }
---

# plan — Multi-role planning protocol

> **v1.1 (2026-06-08):** ultra caveman mode mandatory for ALL sub-agent free-text. Cuts agent output tokens ~75%. Schemas/file paths/enums stay exact (see §0.5).
>
> **v1.2 (2026-06-08):** durability & resume mandatory (§0.6). Squad runs in a detached, resumable background Workflow; a handoff file is written at dispatch time (not at synthesis) so a dropped connection or cold restart picks up seamlessly. Decisions from AskUserQuestion are persisted, not left in the transcript.

## §0.5 — Ultra caveman mode for sub-agents (MANDATORY)

Every `agent(...)` prompt this skill spawns MUST prepend the `CAVEMAN_ULTRA` preamble. Caveman applies to prose fields only: `tldr`, `reasoning`, `design`, `step`, `rationale`, `risk`, `mitigation`, `success_criteria` entries, `open_questions` entries, `priority_reorder`. Enums, file paths, numbers, schema field names stay exact.

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

Main agent's final synthesis (presented to Rich) stays in normal prose — caveman only for sub-agent outputs.

## §0.6 — Durability & resume (MANDATORY)

A `/plan` run spans three fragile moments: (a) the squad fans out, (b) Rich answers clarifying questions, (c) you synthesize. A dropped connection or context summarization between any two loses work unless state is on disk. Make every run survivable:

**1. Run the squad in the BACKGROUND.** The Workflow tool returns a `runId` + `scriptPath` and keeps running server-side whether or not Rich is connected; it re-invokes you on completion. Capture the `runId` and `scriptPath` from the tool result the moment it returns.

**2. Write a HANDOFF FILE at dispatch time — NOT at synthesis.** Immediately after the Workflow launches, write `docs/drafts/<YYYY-MM-DD>_<TOPIC_SLUG>-plan.md` (create `docs/drafts/` if missing; if CWD has no `docs/`, use the repo's doc convention or `./.plan-state/`). It MUST contain:
   - The ask (the brief, condensed) and any proposed approach being challenged.
   - **Locked decisions** — every answer Rich has given (see #3). These live nowhere else durable.
   - Verified current-state facts the squad was given (so a cold restart doesn't re-explore).
   - **Workflow `runId` + `scriptPath` + the verbatim resume command** (see #4).
   - A "NEXT STEP ON RESUME" checklist: check workflow status → resume if incomplete → synthesize → overwrite this file with the final plan.

**3. Persist AskUserQuestion answers the instant they arrive.** Clarifying answers are decisions; the transcript is not a durable store across a cold restart. After every `AskUserQuestion`, append the question + chosen answer (verbatim, including any correction to your framing) to the handoff file's "Locked decisions" section before continuing.

**4. Resume contract.** On reconnect or cold restart:
   - Same session, squad mid-run → `Workflow({scriptPath, resumeFromRunId})`. Completed agents return cached results instantly; only stragglers re-run. Same script + same args = 100% cache hit.
   - Squad already finished → its result is in the transcript / a task-notification re-invokes you; the raw plans also persist as `agent-<id>.jsonl` in the workflow transcript dir (fallback if you must hand-author the synthesis).
   - Cold restart (no session) → read the handoff file; it carries the ask, decisions, facts, and resume command. Re-run the cached Workflow or read the journal, then synthesize.

**5. On synthesis, OVERWRITE the handoff file with the final plan** so it becomes a self-contained `*-plan.md` that `/build` can read directly. Keep the locked-decisions and resume sections; replace the "pending" section with the ordered plan.

This is cheap (one file write at dispatch + one append per question + one overwrite at synthesis) and converts a /plan run from "lose everything on disconnect" to "resume in one step."

## When to use

User says one of:
- `/plan <topic>` (with topic args)
- `/plan` alone — use most recent substantive request from conversation as topic
- "have a team plan this", "spawn a roundtable", "get a panel to think about X"

For comprehensive design / architecture decisions where multiple role lenses each add signal. Not for simple lookups or single-step tasks.

## Protocol

1. **Identify task** — explicit args take priority; else use most recent substantive user request in the conversation.

2. **Pick roles from AGENTS.md** — read `/Users/rich/Documents/GitHub/Mothy/AGENTS.md` "Sub-Agents: 11 Roles" section (or the equivalent in whatever repo CWD is). Pick 5–8 roles whose responsibilities actually overlap the task. Default mix for design tasks: **architecture, product, discovery, ux-designer, security, build, test**. Add **github** when shipping requires PR planning, **validate** when correctness QA is the constraint, **docs** when knowledge artifact is the deliverable. Drop irrelevant roles — 4-role squad beats 11-role squad of bystanders.

3. **Build a shared brief** — single string that includes:
   - Current state of the system / problem
   - Constraints (from CLAUDE.md, AGENTS.md, repo conventions, prior conversation)
   - Any proposed solution already on the table (with explicit invitation to challenge it)
   - Hard rules (protected files, fix-log mandates, red-green TDD if Mothy)
   - "What to return" instructions

4. **Spawn parallel agents via the Workflow tool** — one agent per role, all in parallel, structured output via JSON schema. Each agent gets `${BRIEF} + ## Your role: <name> + <role-specific focus>`. Use this schema (adapt as needed):

```js
// Fibonacci complexity scale — NOT days.
// You don't work in days; you only know what a human team typically takes.
// Story points convey perceived complexity, which is the signal Rich actually wants.
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
          touches_files: { type: 'array', items: { type: 'string' } },
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

**Sizing rules for sub-agents (include verbatim in BRIEF):**
- Use Fibonacci story points (1, 2, 3, 5, 8, 13, 21) — never days, hours, or weeks.
- Estimate perceived complexity, not duration. If two steps both feel "medium" with comparable unknowns, both are 5. If one has more hidden coupling, bump it to 8.
- Anything 21 must be split before reporting back.
- Synthesis presents chunk totals as story-point sums, not time.

4.5. **Write the handoff file (§0.6) the moment the Workflow returns its `runId`.** Before doing anything else — before answering Rich, before any AskUserQuestion — persist the ask, facts, runId, scriptPath, resume command, and a NEXT-STEP-ON-RESUME checklist to `docs/drafts/<date>_<TOPIC>-plan.md`. Append every clarification answer as it arrives. This is non-negotiable: it is the only durable record of the run before synthesis.

5. **Write role-specific focus blocks** — each agent's `focus` is 6–10 bullet specific questions for that role. Don't let "architecture" plan everything; constrain to architecture's domain. Examples:
   - architecture: pipeline shape, component boundaries, API contracts, mermaid, ADRs
   - product: JTBD, user-visible failure modes today, priority ranking with defended order
   - discovery: external option comparison matrices with recommendation
   - ux-designer: how the feature surfaces to user in chat/voice, channel-specific format, correction UX
   - security: threat model, ACL/isolation, PII, prompt injection, audit trail
   - build: file-by-file change list, migration, rollout phasing, rollback
   - test: failing test per move (red-green), recall/regression metrics, manual runbook

6. **Synthesize in main thread** — when workflow returns the 7 (or N) plans, YOU (main agent) review them. Do NOT delegate synthesis to another agent — you carry the full conversation context, sub-agents do not. **Overwrite the handoff file (§0.6 step 5) with the final plan** so `/build` can read it. Produce:
   - **Consensus** — what most roles agreed on
   - **Conflicts** — where roles disagreed, and the resolution (with reasoning)
   - **Gaps** — what no role covered that still matters
   - **Final plan** — ordered, concrete, ready to execute. Include who owns each step, file paths, test names, per-chunk story-point complexity, and a per-task complexity total.
   - **Open questions for Rich** — decisions only he can make

   Present complexity in story points (1–21 Fibonacci). NEVER present "days", "hours", or "weeks" — those numbers are training-data hallucination, not actual signal.

7. **Present the synthesis** — not the raw 7 plans. Rich asked for the final plan, not the deliberation transcript. If a specific plan had a brilliant detail, quote it; otherwise the synthesis is the deliverable.

## Workflow tool boilerplate

```js
export const meta = {
  name: 'squad-<short-topic-slug>',
  description: 'Multi-role independent planning for <topic>',
  phases: [{ title: 'Independent planning' }]
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

return { plans: plans.filter(Boolean) }
```

The Workflow tool returns a `runId` + `scriptPath` + transcript dir. **Capture them and write the handoff file (§0.6) immediately** — do not wait for `plans` to come back. The run is detached and resumable: `Workflow({scriptPath, resumeFromRunId})` replays cached agents on reconnect.

## Rules

- **Ultra caveman mode mandatory** for every sub-agent prompt (§0.5). Prepend `CAVEMAN_ULTRA`. Enums/file paths/schema names exact — caveman only on prose fields.
- **Parallel, not sequential.** All role agents fire in one `parallel()`. They MUST not see each other's plans during stage 1 — independence is the point.
- **Self-contained brief.** Sub-agents have no conversation history. Brief includes everything they need or they will hallucinate.
- **Constrain each role.** Role focus = bullet questions, not "plan this". Otherwise every role writes the same generic plan.
- **Main agent synthesizes.** Final plan is YOUR job, not a synthesis agent's. You have context they don't.
- **Don't dump raw plans on user.** Synthesis is the deliverable. Mention specific dissents/gaps inline.
- **Skip if task is trivial.** Single file read, factual question, status check — answer inline. Squad is for design-level decisions.
- **Durable before synthesis (§0.6).** Write the handoff file at dispatch, persist every clarification answer, overwrite with the final plan. A dropped connection must never cost more than one resume step.

## Anti-patterns

- 11 agents on a 2-file change. Pick 3–4.
- Sequential agents. Squad's whole value is independence + parallelism.
- Same focus block for every role (returns 7 identical generic plans).
- Letting a synthesizer agent write the final plan — they don't have the conversation.
- Showing user the raw JSON dump of all 7 plans.
