# Artifact Catalog — what each artifact is, and which skill makes it

| Artifact | What it is | Stage | Made by | Template / canon |
|---|---|---|---|---|
| R&D Project Registry entry | Index of record: project, originator, stage, sponsor, 5-factor lens, artifact links, repo + live-app links, commit summaries | Spark → onward | idea-intake creates; every skill updates | R&D Project Registry (see process doc) |
| Idea Dossier | Problem frame, prototype link + demo, evidence summary, 5-factor scores, unknowns, verdict | Spark/Proof | idea-intake skill | (Google Doc, no fixed template) |
| Disposable prototype (Sketch) | Watermarked, synthetic-data, internal-only demo testing the riskiest assumption | Spark/Proof | idea-intake skill | prototype-guardrails.md |
| PR/FAQ | Amazon-style press release + FAQ, drafted FROM the prototype and evidence | Proof | pr-faq skill | https://docs.google.com/document/d/16TyUb5L8hiv_EGdWeV-7O1Bi2xAELoU6owe2w_rWoAM/edit |
| PRD | The Commit decision record: problem statement, personas, MoSCoW job stories per milestone, appetite, evidence, security, FAQ | Commit | prd skill | https://docs.google.com/document/d/1WUkbssjpLzkxIsTZ0VAca1FagCZ4maTKTeEaqOMiPP4/edit |
| Complexity map | Relative Fibonacci points across the PRD's milestones/items, sized within the project only — no time units | Commit | prd skill + human | (part of PRD / Commit package) |
| Build plan + tests | /mothy:plan decomposes the PRD; /mothy:build + /mothy:test execute with red-green TDD and adversarial review | Build | agent-orchestrated, human-steered | (in the project repo) |
| Eval set | Graded examples + thresholds proving AI behavior; gates Beta → GA | Commit → Build | evals skill + human | (in the project repo / PRD) |
| Release comms | Per product type (content/app/feature; AI branch waits for green evals) | Launch | product + marketing | Lucidchart flow linked from the process doc |
| legacy 1-Pager | RETIRED. Older projects may still have one — link it under the PRD's Related Documents; do not create new ones | — | — | — |

Values source for all of it: Product First Principles
https://docs.google.com/document/d/1MLDMJ9-F7iMJ3-a1KWP9mF_RTtz_1F8mzQHf7_52y0U/edit

Confluence is no longer in use — if a search surfaces old Confluence template pages, they
are stale; the Google Docs above are canonical.
