# Disposable Prototype Ground Rules (Sketch tier)

These mirror the Software Product Planning Process and are NON-NEGOTIABLE. They are what
makes open prototyping safe at a company whose customers are military and government
organizations.

## The rules

1. **Throwaway by default.** The prototype exists to answer one question — the riskiest
   assumption — not to become the codebase. Say this to the user at build time and again at
   hand-off: if the idea is greenlit, production is rebuilt properly by engineering, from
   zero. Prototype code never enters production repositories without an explicit
   engineering-led rewrite decision.
2. **Effort cap: ~2 days.** If it needs more, that's a signal to seek a sponsor, not to keep
   building.
3. **Synthetic data ONLY.** Never: customer data, CUI, real trainee or readiness records,
   real unit names, real people's names. Generate plausible fake data and label it as fake
   in the UI where visible. Anything that needs real data is beyond Sketch tier — it enters
   the security-review path with engineering ownership (Alpha at minimum).
4. **Watermark generated into the UI**, not stapled on: a fixed, visible banner reading
   "PROTOTYPE — not a Moth+Flame product · synthetic data" on every screen. Build it into
   the page chrome so screenshots carry it too.
5. **Internal-only.** Sketch prototypes are never shown to customers or anyone outside the
   company. No public hosting of government-flavored demos; no customer or unit names in
   URLs, titles, or file names.
6. **Archived, not orphaned.** When the idea advances or dies, record the prototype link and
   a short demo video on the Productboard record and in the Idea Dossier.

## Build targets by surface

- **Chat/Cowork**: a self-contained HTML Artifact (private by default — do not share the
  link outside the company). The watermark banner is part of the page.
- **Claude Code**: a local self-contained HTML file, or a throwaway deploy on the team's
  internal lane if one is configured. Default conservative: local file + screen recording.
- **Either**: for VR/conversational concepts that can't be clicked, a scripted walkthrough
  (storyboard + narrated flow) counts as a prototype — the point is making the experience
  concrete enough to react to.

## Shaping rule

Before building, name the riskiest assumption and design the prototype to test exactly
that. A beautiful surface that dodges the risky part is decoration, not evidence.
