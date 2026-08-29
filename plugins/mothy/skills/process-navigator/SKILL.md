---
name: process-navigator
description: >-
  Tell anyone at Moth+Flame where their idea or project sits in the product
  process and what artifact or step comes next. Triggered by:
    - "what's next for [idea]", "where is [project] in the process", "what do
      I need before the review", "do I need a PRD or a PR/FAQ?", "how does the
      product process work", "who reviews this", "process navigator"
    - Someone seems lost about the product process.
  Routes to the idea-intake, pr-faq, or prd skill when that's the next step.
---

# Process Navigator

Wayfinding for the Software Product Planning Process. Zero-interview by design: given a
project or idea name, look up the evidence and diagnose — ask at most "which project?" and
one disambiguation. This is a conversational skill, not a document mill.

Read `references/process-map.md` for the stage rubric and `references/artifact-catalog.md`
for what each artifact is and which skill produces it.

## Flow

1. **Locate the artifacts.** Drive search by project name (Idea Dossier? PR/FAQ? PRD? legacy
   1-Pager?); Mothy OpsHub/intel for linked accounts/opportunities and Productboard mentions;
   Granola for whether a Demo Review or Commit Review discussion happened. Artifacts carry a
   machine-findable footer (`Project: <name> | Stage: <stage> | Prior artifact: <link>`) —
   use it, but verify against the actual content.
2. **Diagnose the stage** against the rubric in references/process-map.md (evidence tiers
   E0-E4; stages Spark → Proof → Commit → Build → Launch & Tend). Never guess without citing
   the evidence found — or say plainly "I found nothing, so I'm treating this as a brand-new
   idea."
3. **Answer in three parts:**
   - **You are here** — stage + evidence tier, with links to what was found.
   - **Next step** — the single next artifact or checkpoint, who's involved (sponsor, peer
     PM, VP of Technology, Head of Product), and what it requires.
   - **I can start it now** — offer the right skill: idea-intake if nothing exists, pr-faq
     if a dossier/prototype exists but no PR/FAQ, prd if the PR/FAQ is sponsored/greenlit.
4. **Generic question** ("how does the process work?"): give the short stage-map answer and
   link the canonical Software Product Planning Process doc — never restate the whole doc.
5. If artifacts conflict (a PRD exists but no PR/FAQ for a new product; footer stage
   contradicts content), flag it rather than papering over it.

## Deliverable

A conversational answer. Offer a one-page status Google Doc only if the user wants to share
status with others.

## Drift self-check

references/process-map.md carries a "Synced" date. If it is more than 90 days old, say so:
"my process map was last synced <date> — if the process doc changed since, trust the doc,"
and link the canonical doc.
