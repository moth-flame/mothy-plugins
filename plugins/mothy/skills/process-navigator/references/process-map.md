# Process Map — stages, evidence, gates

Source of truth: Software Product Planning Process
https://docs.google.com/document/d/1xGSsNlz5v0rHb3DhbIFhM5ipZN3sd4xYFEprzgOQ0IE/edit
Synced: 2026-08-29 (wave 2). If this file and the Doc disagree, the Doc wins — re-sync this file.

## Evidence tiers

- E0 Stated — someone claims the pain exists
- E1 Prototyped — a disposable prototype exists and can be demonstrated
- E2 Tested — the prototype met reality (internal SMEs and/or ≥1 real customer signal)
- E3 Committed — complexity-mapped (relative Fibonacci), security-screened, eval-planned
  (AI), greenlit at Commit Review
- E4 Proven — alpha metrics in hand from real usage

## Stage rubric (observed evidence → stage)

| Observed | Stage | Evidence tier |
|---|---|---|
| Nothing exists | Pre-Spark → route to idea-intake | — |
| Registry entry and/or Idea Dossier, maybe a prototype; no PR/FAQ | **Spark** | E0-E1 |
| Prototype + dossier + feedback gathered, or PR/FAQ in draft; no sponsor | **Proof** | E1-E2 |
| PR/FAQ done + sponsor named in registry; PRD in progress; Commit Review not yet passed | **Commit (prep)** | E2-E3 |
| Commit Review passed; repo + /mothy:plan output exist; Alpha or Beta in progress | **Build** | E3-E4 |
| GA shipped | **Launch & Tend** | E4 |

## Gates and forums

- **Sponsorship** — asynchronous, no meeting. Demo video + evidence posted to the registry
  entry; a named sponsor (PM, department head, account owner) attaches one piece of real
  customer evidence and stakes their credibility. Outcomes recorded in the registry:
  advance / iterate / shelve. There are NO weekly ceremonies in this process — the only
  recurring company meeting is Backlog Grooming, which is not part of R&D. Rich has
  visibility via the registry and the daily Mothy digest.
- **Commit Review** — the one stage-gate meeting; replaces the old "Why"/"How"/Resource
  Funding checkpoints. Attendees: sponsor, product, VP of Technology, leadership. Requires:
  PRD (decision record, incl. a self-measuring North Star metric), complexity map (relative
  Fibonacci, from zero), security/data screen (gov-facing), eval plan + dual metrics (AI
  features), finalized PR/FAQ. Output: greenlight + funding + roadmap slot (feeds the
  Sales/Marketing forecast).

## Maturity ladder

Sketch (disposable, watermarked, synthetic data, internal-only, never customers) → Alpha
(internal; controlled sales/marketing use; real data only inside security review) → Beta
(≥1 external customer) → GA (hardened, broad audience). "A prototype is not a product."

## Who's who (roles)

- Sponsor: any PM, department head, or account owner who stakes credibility on an idea
- Funnel owner (registry policy, digest, sponsorship norms): Head of Product (Rich Headley)
- Technical gate at Commit Review: VP of Technology
- Security reviewer: named per project for government-facing work

## Build mechanics (no sprints, no user stories, no JIRA)

Agent-orchestrated SDLC: /mothy:plan decomposes the PRD's MoSCoW job stories into a build
plan; /mothy:build executes with parallel sub-agents, red-green TDD, and adversarial
verification; /mothy:test authors and audits tests; /mothy:fix handles bugs. The evals
skill builds eval sets for AI features (green evals gate Beta → GA). Registry discipline:
repo link, live-app link, and commit summaries stay current in the registry as work lands.

## Standing post-GA

Every PRD carries a dated fish-or-cut-bait review (~90 days post-GA). AI features: standing
dual-metric reviews (drift is expected).
