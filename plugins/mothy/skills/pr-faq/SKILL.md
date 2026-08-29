---
name: pr-faq
description: >-
  Write an Amazon-style PR/FAQ (press release + FAQ) the Moth+Flame way —
  working backward from the customer, drafted FROM prototype evidence.
  Triggered by:
    - "write a PR/FAQ", "PRFAQ", "press release for [idea]", "working
      backwards doc", "pitch this idea internally", "visioning doc"
    - A validated idea or prototype needs its visioning document (Proof stage)
    - Invoked as the hand-off from the idea-intake skill, and consumed by the
      prd skill as input.
  Source of truth: the PR/FAQ template Google Doc (linked in references/template.md).
---

# PR/FAQ Writer

Produce a Moth+Flame PR/FAQ: an Amazon-style press release plus FAQ that forces working
backward from the customer. In the AI-native process this document is written AFTER the idea
has been rehearsed — the default input is a prototype and the evidence it earned (Proof
stage of the Software Product Planning Process). Anyone at Moth+Flame can author one; adapt
to the user (see Interview Style below).

Read `references/template.md` for the exact document structure before drafting, and
`references/exemplar-predictive-readiness.md` for the house voice and quality bar.

## Phase 0 — Research before asking (do this FIRST, silently)

Never open with a questionnaire. Gather what can be gathered:

1. **Intake dossier**: if invoked from idea-intake or the user names a project, search Drive
   (`mcp__Google_Drive__search_files` or Mothy `drive` actions) for an Idea Dossier, prior
   PR/FAQ, or related docs on the same theme. If a PR/FAQ already exists, offer to update it
   in place (mothy:edit-in-place) instead of duplicating.
2. **Customer evidence**: Mothy `intel_search` / OpsHub for accounts and opportunities
   mentioning this pain; Granola (`intel_meeting_search`) for customer meetings where the
   problem came up — verbatim customer language is the best raw material for the Customer
   Problems section and the illustrative quote.
3. **Market and ROI research**: web search for cost-of-problem statistics with citable
   sources. Build the ROI model draft per `references/roi-table-guide.md` — the exemplar's
   sourced ROI table is the standard.
4. **Prototype**: read the prototype link/demo notes if they exist. The "solution at work"
   section describes what the prototype demonstrates; link the demo rather than restating it.

## Phase 1 — Confirm-or-correct interview (max ~6 questions)

Ask ONLY what research could not answer. Batch where natural; in Claude Code use the
mothy:mc widget for enumerable choices, in Chat/Cowork ask inline. Human-only questions:

- Project name (taste — human decides)
- Intended launch date (intent, not fact)
- Confirm the AI-proposed customer segment and ranked problem list (present drafts, let them
  rank/correct — never ask them to recite from memory what research already found)
- Solution summary in one or two sentences if no prototype exists
- Price-point assumptions for the ROI model

Everything else is AI-drafted and human-reviewed: leader quote (draft in the leader's voice
from prior public quotes; FLAG as requiring that person's sign-off before the doc leaves
Draft), getting-started, illustrative customer quote (grounded in real transcript language),
FAQ answers.

## Phase 2 — Draft, self-check, deliver

Draft the full document per `references/template.md`, then run every quality check:

- Headline matches the formula: MOTH+FLAME ANNOUNCES [X] TO ENABLE [SEGMENT] TO [BENEFIT].
- Press release ≤ 1.5 pages; a customer could read it and know exactly what they get.
- Every Customer Problem maps to a numbered mechanism in the solution section.
- Zero unexplained jargon ("be clear, not clever").
- ROI claims have live, numbered, cited sources; re-verify the arithmetic.
- "What might disappoint" and "most contentious" answers are genuinely uncomfortable — if
  they read as humble-brags, redo them.
- Illustrative quote is marked `[ILLUSTRATIVE — fictional quote]` and attributed ONLY to an
  invented composite persona — never a real, named customer, unit, office, or
  plausible-sounding real name. Leader quote flagged for named-person approval.
- **The FAQ is DERIVED, never copied from a canned list.** Three questions are always
  present because they keep the doc honest: what might disappoint the customer; what is the
  most contentious aspect; why now. Every other question is chosen because THIS product will
  actually face it — derive candidates from the segment (government → funding path/NDAA,
  data dependencies, internal-data-only fallback, channel partners), the product's nature
  (AI-powered → achievable accuracy and how we'll prove it, per the eval plan), the ROI
  story (worked, sourced math per references/roi-table-guide.md), and — most importantly —
  the objections and questions that actually came up in customer conversations, sponsor
  reactions, and prototype demos. Old exemplar questions are candidates, not requirements;
  drop any that don't apply and add ones the evidence surfaces.
- Prototype Evidence section is present; the human-attestation lines (real customer
  conversations; riskiest assumption) are left as visible prompts — NEVER AI-filled.

**Deliverable**: a Google Doc (never an offline file), created via Mothy `docs_create_formatted`
in the same Drive folder as prior PR/FAQs when findable, shared so ai@mothandflamevr.com can
edit, titled `PR/FAQ: [Project Name]`. Include the provenance line (drafted with pr-faq
skill, date, inputs; review status unreviewed). Return the Doc URL.

Update the project's R&D Project Registry entry with the PR/FAQ link and stage (Proof). If
no registry is configured yet, record the link in the Idea Dossier and offer to Slack Rich
Headley the doc link so he has visibility. Add the machine-findable footer:
`Project: <name> | Stage: Proof | Prior artifact: <dossier link if any>`.

End with the chain: "Next step is an async sponsor — post the demo + this doc to your
registry entry and ask a PM, department head, or account owner to sponsor it. Once
sponsored and greenlit, the prd skill turns this into the Commit decision package."

## Interview style

Calibrate silently from how the user talks. Novice (no PM vocabulary): one question at a
time, one-line "why I'm asking," no jargon, propose-and-pick. Expert (says MoSCoW, appetite,
segment): batch questions, use template vocabulary, accept pasted fragments, shift from
drafting-for to red-teaming.

## Operate from the Product First Principles

Read `${CLAUDE_PLUGIN_ROOT}/docs/product-first-principles.md` (or the canonical Doc it
links) and let it steer the drafting: envision the customer's problem and work backward;
be clear, not clever; prototype the promise before you write the promise; product ideas
from anywhere, product decisions from evidence.

## Surface notes

- Claude Code: use mothy:mc for choice questions; Mothy MCP actions for Drive/intel/Granola.
- Chat/Cowork: ask choices inline (AskUserQuestion where available); same Mothy actions.
- Both: deliverable is always a Google Workspace doc, never a local file download.
