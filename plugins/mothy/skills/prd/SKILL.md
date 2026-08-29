---
name: prd
description: >-
  Write a Product Requirements Document (PRD) the Moth+Flame way — problem
  statement, personas, MoSCoW job stories per milestone, appetite, evidence,
  FAQ. Triggered by:
    - "write a PRD", "requirements doc", "scope this feature", "turn this
      PR/FAQ into a PRD", "Commit decision package", "project page"
    - A sponsored, greenlit idea needs its Commit-stage decision record.
  Ingests the PR/FAQ, prototype, and meeting transcripts instead of re-asking.
  Source of truth: the PRD template Google Doc (linked in references/template.md).
---

# PRD Writer

Produce a Moth+Flame PRD: the Commit-stage decision record in the Software Product Planning
Process. The prototype carries everything demonstrable; the PRD records what the demo cannot
show — who it's for, what it's worth, priorities, what's out, metrics, security posture.
A PRD that restates what the demo shows is waste; a PRD missing what the demo can't show is
a landmine.

Read `references/template.md` for the exact section order before drafting;
`references/exemplar-hard-skills-ux.md` for the house voice;
`references/problem-statement.md` for the problem-statement spine;
`references/ai-feature-addendum.md` when the feature is AI-powered.

## Phase 0 — Ingest, don't interrogate

1. **Find the PR/FAQ first** (Drive search by project name; ask for the link only if not
   found). Import from it: segment, problems, solution shape, why-now, contentious aspects.
   Never re-ask what it answers. If no PR/FAQ exists for a new product, pause and offer the
   pr-faq skill first (visioning precedes versioning); enhancements to existing products may
   proceed without one.
2. **Ingest the Idea Dossier and prototype**: job stories are largely OBSERVED from what the
   prototype does and where it falls short, then confirmed with the human.
3. **Granola**: transcripts of Demo Review or related meetings feed Open Questions, FAQ, and
   stakeholder concerns.
4. **Mothy intel/OpsHub**: which customers/opportunities are waiting on this — feeds Success
   Metrics and the deadline rationale.
5. **AI-powered feature?** Apply `references/ai-feature-addendum.md`: 5-factor pain lens,
   4D structure, dual success metrics, eval-set requirements.

## Phase 1 — The questions that survive (human-only)

- **Complexity map — co-build it, human confirms.** Size the PRD's milestones and major
  scope items in relative Fibonacci points AGAINST EACH OTHER within this project — no time
  units (agent-orchestrated work happens in hours and days; time isn't worth measuring), no
  cross-project normalization. Propose the map from the job stories; the human adjusts and
  owns it. "Don't shop without a price tag" — the price tag is complexity and real dollars.
  Calendar checkpoints (test-by / launch-by dates) are optional and human-decided.
- **Opportunity headline and quantified pain — draft, human confirms.** Fill the
  business-case mad-libs (see references/problem-statement.md): "Because of [change/shift],
  we should [approach] by [timeline]; we'll avoid [negative outcomes] while unlocking
  [positive outcomes]" and quantify the pain with frequency × reach × cost + what happens
  if unaddressed. Research fills the numbers; the human vouches for them.
- Confirm the persona list and the AI-prefilled problem statement, slot by slot.
- MoSCoW rankings: AI proposes the milestone ladder (Alpha → Beta → GA) and job stories in
  the exact format "As a [persona], while [situation/location], I want to [action] so that
  [job-to-be-done]"; the human re-ranks and vetoes. Priority is a judgment about scarce
  build capacity — it stays human. These job stories are NOT sprint tickets (we run no
  sprints and write no user stories): they are the requirements contract that /mothy:plan
  decomposes and /mothy:build executes — write each one specific enough that a planning
  agent can decompose it without asking.
- Related/other scope per milestone, briefly ("what," not "how").
- Final question, always: "Anything else — docs, designs, constraints — before I write?"

## Phase 2 — Draft, self-check, deliver

Draft per `references/template.md`, then run every quality check:

- Problem statement: every slot filled; [downside] is a real tradeoff someone will dislike;
  [Unlike] names a real alternative or the status quo, not a strawman.
- Every milestone has ≥1 Must job story; every Must story passes the developer-clarity test
  ("could I write a JIRA ticket from this alone?"). Situation-triggered format, not generic
  user stories.
- Complexity map present: relative Fibonacci points on milestones and major scope items,
  human-confirmed; calendar checkpoints if the human set them.
- Success metrics complete: metric, value, target (before → after), how INSTRUMENTED. **At
  least one metric — the North Star — must measure itself with zero human intervention:**
  an event, counter, or query the product emits on its own. Prefer bespoke instrumentation
  built into the product over adopting a product-analytics suite; the PRD states exactly
  what emits the number and where it lands. A metrics table where every row needs a human
  to go count something fails this check. AI features: dual metrics present and an eval-set
  line item exists in some milestone (the evals skill helps build it — nobody is expected
  to know how to write evals unaided).
- Features Out is non-empty. Assumption ledger populated — assumptions the AI drafted are
  tagged Assumed with an owner, never silently presented as fact.
- Prototype & Evidence section present; author-attestation lines (real conversations;
  riskiest assumption) left as visible prompts — NEVER AI-filled.
- Security/Privacy: for government-facing work, prompt for ATO/impact-level implications and
  name a security reviewer; write "unknown + owner" rather than reassurance.
- FAQ covers the hard questions (imported unanswered PR/FAQ questions included); no filler
  to hit a count.
- Consistency sweep vs the PR/FAQ: same segment, same problems; call out any drift to the
  user explicitly rather than papering over it.

**Design artifacts — generate them, don't just leave slots.** The Design section must hold
real artifacts, produced by this skill during drafting:
- A workflow diagram (Mermaid flowchart or sequence diagram) of the future-state user flow —
  render it and insert it into the doc via Mothy `docs_insert_image` (imageBase64 of the
  rendered diagram) in the Workflow Diagrams subsection, or link the rendered artifact if
  insertion fails.
- A system/breadboard sketch when multiple components collaborate (same mechanism).
- The prototype link + production-deltas list.
If the user has Figma or other design files, link them in Design Artifacts; otherwise
generate first-pass artifacts and mark them as drafts for a designer to replace.

**Deliverable**: a Google Doc via Mothy `docs_create_formatted`, shared so
ai@mothandflamevr.com can edit, titled `PRD: [Project Name]`, following the template's
section order exactly. Change-history row 1 credits the human author. Review Checklist
listed by role with current holders unchecked. Provenance line + machine-findable footer:
`Project: <name> | Stage: Commit | Prior artifact: <PR/FAQ link>`.

Update the project's R&D Project Registry entry with the PRD link and stage (Commit prep).
If no registry is configured yet, record it in the Idea Dossier and offer to Slack Rich the
link.

End with the chain: the PRD goes to Commit Review (product + VP of Technology + leadership —
the one stage-gate meeting); after greenlight, the build is agent-orchestrated — offer to
kick off /mothy:plan against this PRD.

## Operate from the Product First Principles

Read `${CLAUDE_PLUGIN_ROOT}/docs/product-first-principles.md` (or the canonical Doc it
links) and let it steer the PRD: think big, start small; stubborn on vision, flexible on
details; measure what we value; spend tokens before engineer-weeks; fish or cut bait (the
fish-or-cut-bait review date goes in the PRD).

## Interview style + surface notes

Same as the pr-faq skill: silently calibrate novice vs expert; mothy:mc for choices in
Claude Code, inline questions in Chat/Cowork; deliverable is always a Google Workspace doc.
