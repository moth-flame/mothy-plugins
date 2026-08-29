# Product-Process Skills — Release & Sync Checklist

Five skills ship in two containers from ONE source (the Mothy plugin repo's `skills/`
folders). Never hand-edit the org-skill copies independently.

## The canon chain

Google Docs (canonical) → skill `references/` files (condensed operational copies, each
stamped with a "Synced" date) → two distribution containers (Mothy plugin + org skills).

Canonical docs:
- Software Product Planning Process — https://docs.google.com/document/d/1xGSsNlz5v0rHb3DhbIFhM5ipZN3sd4xYFEprzgOQ0IE/edit
- PR/FAQ Template — https://docs.google.com/document/d/16TyUb5L8hiv_EGdWeV-7O1Bi2xAELoU6owe2w_rWoAM/edit
- PRD Template — https://docs.google.com/document/d/1WUkbssjpLzkxIsTZ0VAca1FagCZ4maTKTeEaqOMiPP4/edit
- Product First Principles — https://docs.google.com/document/d/1MLDMJ9-F7iMJ3-a1KWP9mF_RTtz_1F8mzQHf7_52y0U/edit

Confluence is retired — no copies live there.

## Release steps (any time a doc or skill changes)

1. Edit the canonical Google Doc first (in place — version history is the audit trail).
2. Re-sync the affected `references/*.md` files in the plugin repo; update their "Synced"
   dates. `process-navigator/references/process-map.md` self-reports its date when >90 days
   old, so drift announces itself in use.
3. Bump the plugin version in `.claude-plugin/plugin.json` (this release: 0.26.0) and commit
   to the mothy-plugins repo.
4. Claude Code users: `claude plugin update mothy` (or the mothy:update-skills coach).
5. Chat/Cowork: an admin re-uploads the five org-skill zips (idea-intake.zip, pr-faq.zip,
   prd.zip, evals.zip, process-navigator.zip) in org settings → Capabilities → Skills.
6. Spot-check: invoke process-navigator once on each surface; it should cite the new synced
   date.

## Cadence

Quarterly (or when the process doc changes): diff each references/template.md against its
canonical Doc. Owner: Rich Headley.
