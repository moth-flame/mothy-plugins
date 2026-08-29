---
name: idea-intake
description: >-
  Turn any Moth+Flame employee's raw idea into a framed problem, a disposable
  AI prototype, and evidence — the on-ramp into the product process. No PM
  experience needed. Triggered by:
    - "I have an idea", "what if we built", "customers keep asking for",
      "can we prototype this", "pitch an idea", "idea intake"
    - Someone describes a pain or opportunity with no existing artifact.
  Ends by offering to draft the PR/FAQ. Spark stage of the Software Product
  Planning Process.
---

# Idea Intake — the democratization on-ramp

Help any employee take a raw idea to framed problem → disposable prototype → evidence →
verdict. This skill is a funnel, not a document generator. Assume the user is NOT a product
manager: zero jargon, one question at a time, each with a one-line "why I'm asking." Starting
an idea grants no engineering time, roadmap slot, or customer exposure — say so warmly if
asked; those are earned through async sponsorship and at Commit Review.

Read `references/problem-frame.md` for the frame format,
`references/prototype-guardrails.md` before building anything,
`references/evidence-kit.md` for the feedback loop.

## Stage 1 — Capture (2-3 questions, plain language)

"What's the problem, who has it, and how do you know?" Accept a rant, an anecdote, a
half-idea. Do not mention MoSCoW, personas, horizons, or templates.

## Stage 2 — Frame the problem (AI does the work)

Research before asking anything else:
- Mothy `intel_search` / OpsHub: which accounts exhibit this pain?
- Granola `intel_meeting_search`: has a customer said this on a call? Pull verbatim language.
- Drive search: has someone already written this up? If yes, show them and route to
  process-navigator instead of duplicating.
- Light web research: does the market have a name for this problem?

Produce a one-screen **Problem Frame** (format in references/problem-frame.md): persona,
pain, job-to-be-done, evidence found, the five-slot problem statement with gaps marked
[UNKNOWN], and a 5-factor traffic-light row (magnitude/frequency/severity/competition/
contrast). The traffic lights are a conversation starter that teaches product thinking, not
a gate. Confirm in the submitter's own words: "did I understand you right?"

## Stage 3 — Disposable prototype (Sketch tier)

Ask ONE shaping question: "what's the riskiest assumption — the thing that, if wrong, kills
this idea?" Shape the prototype to test exactly that, not the prettiest surface.

Build per `references/prototype-guardrails.md` — non-negotiables: watermark generated into
the UI, synthetic data only, internal-only, effort capped (~2 days), disposable by default.
Surface targets: Chat/Cowork → an Artifact; Claude Code → local HTML or a throwaway internal
deploy. Quote the first principles when useful: "think big, start small"; "bullets before
cannonballs."

## Stage 4 — Evidence loop

Hand the submitter the evidence kit (references/evidence-kit.md): who to show it to
(suggest 2-3 internal stakeholders/SMEs from OpsHub and org knowledge — Sketch prototypes are
never shown to customers), three questions to ask them, and an offer to mine the Granola
transcript of any demo call afterward.

When they return with reactions: summarize, update the Problem Frame, distinguish "people
said" from "people did," then present the verdict options:
- **Pursue** → Stage 5.
- **Pivot** → reframe and re-prototype (cheap; that's the point).
- **Park** → record gracefully, no shame. "Fish or cut bait" — a cheaply killed idea is a
  success story. The dossier is still written so the idea isn't lost.

## Stage 5 — Hand-off

Write the **Idea Dossier**: a Google Doc via Mothy `docs_create_formatted`, shared so
ai@mothandflamevr.com can edit, titled `Idea Dossier: [Name]` — problem frame, prototype
link + demo video, evidence summary, 5-factor scores, open unknowns, verdict. Footer:
`Project: <name> | Stage: Spark (or Proof if evidence gathered) | Prior artifact: none`.

**Register the project.** Create or update the R&D Project Registry entry: project name,
originator, stage (Spark, or Proof once evidence exists), problem frame link, prototype
link + demo video, 5-factor scores, verdict. The registry is how Rich and Mothy see every
project without status meetings or check-ins — registering is what makes the idea real. If
no registry is configured yet, the Idea Dossier serves as the entry: offer to Slack Rich
Headley the dossier link so he has visibility from day one.

Then: "Next step is an async sponsor — no meeting needed. Post your demo video to the
registry entry and ask a PM, department head, or account owner to sponsor it (they attach
one piece of real customer evidence). When you're ready, the pr-faq skill can draft your
PR/FAQ straight from this dossier — want me to start it now?" On yes, invoke pr-faq with
the dossier; its interview collapses to naming + confirmation.

## Quality checks

- Problem Frame confirmed by the submitter in their own words before any prototype work.
- Prototype carries the watermark and contains zero real customer data, CUI, real trainee/
  readiness records, or real unit names.
- Evidence section separates "people said" from "people did."
- Park verdicts still produce the dossier (institutional memory).
- The hand-off text explicitly says the prototype gets rebuilt properly if greenlit — never
  let a prototype silently become the product.
- The registry entry (or dossier + Slack note to Rich) exists before this skill declares
  itself done — an unregistered idea is invisible, and invisible ideas can't earn sponsors.

## Operate from the Product First Principles

Read the plugin's docs/product-first-principles.md (or the canonical Doc it links). The
ones that steer intake: envision solutions to customers' problems and work backward; think
big, start small; prototype the promise before you write the promise; ship to learn —
bullets before cannonballs; fish or cut bait.
