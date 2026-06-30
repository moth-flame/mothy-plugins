# Video + Article Runbook

Regression checklist and manual runbook for the `/video` and `/article` skills.

This document is the human-facing gate that a `/video` → `/article` run must pass
before the output is considered shippable. It has three parts:

1. **§6 Gotcha Gates** — nine explicit pass/fail checks that encode the failure
   modes we have actually hit when capturing CommandIQ demos. Each gate has a
   concrete *how to verify* and an unambiguous *pass/fail* line.
2. **Generalization Smoke** — a procedure proving the skills work on a flow that
   has nothing to do with CommandIQ. If the smoke needs zero CommandIQ-specific
   edits, generalization holds.
3. **Mock-Blind Walls** — the live integration failures that a mocked test run
   will never surface, and which the smoke MUST exercise against real services.

> Scope note: the skills drive a **real running app** with Playwright, generate
> voiceover with ElevenLabs, assemble with ffmpeg, and publish an article to a
> Zoho Desk **Draft**. Nothing here publishes live. Credentials resolve
> env-var-first; never write a literal secret into any file produced by a run.

---

## Environment preconditions

Confirm these before any capture run. A miss here invalidates every gate below.

- **Scratchpad root:** exactly one scratchpad directory, addressed by absolute
  paths only. No `/tmp`, no relative paths, no second scratchpad root spawned
  mid-run. (See Gate 8.)
- **Demo identity:** log in as `demo-capture+vanguard@mothandflame.test` on
  `https://dev-commandiq.mothandflamevr.com`. Password comes from the
  `COMMANDIQ_DEMO_CAPTURE_PASSWORD` env var **at runtime** — it must never be
  written into a script, a log, a VO transcript, or a screenshot.
- **Org selection:**
  - `Vanguard Defense Group` → strategic flow (leadership / readiness).
  - `Vanguard Sustainment` → technical flow (CommandMRO / maintenance).
  - Demo data is anonymized and PII-safe by construction. (See Gate 1.)
- **Credentials present** (env-var-first, then `$MOTHY_STATE_DIR`, then
  `~/.mothy/.state/<file>.json`):
  - `ELEVENLABS_API_KEY` (strip surrounding quotes if present)
  - `VIMEO_ACCESS_TOKEN` (Vimeo Pro account, token carries the `upload` scope)
  - `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` (Self-Client;
    scopes `Desk.articles.ALL,Desk.settings.ALL,Desk.basic.READ,Desk.search.READ`)
- **Brokered services** (no local secret — go through the Mothy MCP):
  - Slack channel `C05T9FA39DE` (#product_and_customer_success) + DM.
  - Google Sheet `12MDZoe8QOjK-AYLRjUaiWRbFcblrdPVcmxzXJfvyhaE` (Demo Videos tab).
- **Zoho non-secret config:** org `830065756`, root KB category
  `Using CommandIQ`.

---

## §6 Gotcha Gates

Each gate is **PASS** only if the verify step is observed directly. "Should be
fine" is **FAIL**. When a gate fails, fix the capture and re-run — do not ship
around it.

### Gate 1 — PII-safe demo org

- **Why:** real customer data must never reach a video, a screenshot, a VO line,
  or a published article.
- **Verify:** capture ran against `Vanguard Defense Group` /
  `Vanguard Sustainment` only. Scan every captured screenshot and the VO
  transcript for real names, emails, unit IDs, phone numbers, or any string that
  is not anonymized demo data. The login email and the capture password appear
  nowhere in any artifact.
- **PASS:** all on-screen and spoken identifiers belong to the anonymized demo
  org; no secret literal present.
- **FAIL:** any real PII or any credential literal is visible in an artifact.

### Gate 2 — Org-admin-gated learner creation

- **Why:** creating a learner is an admin-only action; attempting it as a
  non-admin produces a broken, non-reproducible beat.
- **Verify:** if the flow creates a learner, the capture session is acting as an
  org admin. The learner-create beat completes and the new learner is visible in
  the roster afterward.
- **PASS:** learner-create succeeds end-to-end and the new record is observable.
- **FAIL:** the create button is disabled/absent, the beat errors, or the new
  learner cannot be confirmed in the roster.

### Gate 3 — Verify cross-beat values from pixels **and** DB

- **Why:** a value shown in beat 2 (e.g. an assignment count, a score, a status)
  must be the *same* value the app actually persisted — not a stale render or a
  fabricated VO claim.
- **Verify:** for every value the VO asserts or that the video relies on across
  more than one beat, confirm it twice: read it off the pixels in the screenshot
  **and** confirm the same value in the database / API. The two must agree.
- **PASS:** every cross-beat value matches pixels-vs-DB.
- **FAIL:** any value differs between what's on screen and what's persisted, or
  the VO states a number that the DB does not back.

### Gate 4 — Kill the loading splash everywhere

- **Why:** a capture that grabs the frame mid-load ships a spinner or skeleton
  instead of content.
- **Verify:** every screenshot and every video frame shows fully-loaded content.
  No loading splash, spinner, skeleton row, or shimmer in any captured frame —
  on **every** beat, not just the first.
- **PASS:** zero loading/transition artifacts across all frames.
- **FAIL:** any spinner / skeleton / partial render appears in a shipped frame.

### Gate 5 — Wait for dashboards to populate

- **Why:** dashboards and charts hydrate asynchronously after the page is
  "loaded"; a too-early capture shows empty axes or zeroed tiles.
- **Verify:** any dashboard / chart / metric tile in the capture shows real
  populated data, with the capture taken after hydration completes (not just
  after `load`/`networkidle`).
- **PASS:** all dashboard widgets render their real values.
- **FAIL:** any chart, tile, or table is empty/zeroed because it was captured
  before it populated.

### Gate 6 — Protect the hold so the reg-code reveals

- **Why:** the registration-code reveal depends on a deliberate hold/wait step;
  skipping it captures the pre-reveal state and the code never appears.
- **Verify:** the beat that reveals a registration code holds long enough for
  the reveal to complete, and the revealed code is visible and legible in the
  captured frame.
- **PASS:** registration code is fully revealed and readable in the frame.
- **FAIL:** the frame shows the masked / pre-reveal state, or the hold was cut
  short.

### Gate 7 — Cursor bloom only on real clicks

- **Why:** the synthetic cursor / finger-dot bloom animation signals an actual
  interaction; firing it on hover or non-clicks misleads the viewer.
- **Verify:** the cursor-bloom overlay fires **only** on genuine click/tap
  actions. No bloom on pure mouse-move, hover, scroll, or programmatic
  navigation.
- **PASS:** every bloom corresponds 1:1 to a real click/tap; no spurious blooms.
- **FAIL:** a bloom appears without a corresponding click, or a click lacks its
  bloom.

### Gate 8 — One scratchpad root, absolute paths

- **Why:** a second scratchpad root or a relative path scatters artifacts and
  breaks the `/article` hand-off that consumes per-step files by absolute path.
- **Verify:** all run artifacts live under a single scratchpad root and every
  path written by the run is absolute. No `/tmp`, no relative paths, no
  duplicate scratchpad directory.
- **PASS:** one root, all absolute paths, every per-step artifact resolvable.
- **FAIL:** artifacts split across roots, any relative path, or a stray `/tmp`
  write.

### Gate 9 — Match VO to the real screen

- **Why:** the voiceover must describe what is actually on screen at that
  moment; drift between narration and pixels destroys trust and breaks
  video↔article parity.
- **Verify:** play each beat and confirm the VO line describes the exact screen
  state and the exact action shown — same labels, same numbers, same order. The
  article's written step for that beat says the same thing as the VO.
- **PASS:** VO, on-screen content, and the article step agree for every beat.
- **FAIL:** the VO names a button/value/screen that isn't the one shown, or
  leads/lags the action it narrates.

### Gate summary table

| # | Gate                                   | Pass when…                                            |
|---|----------------------------------------|-------------------------------------------------------|
| 1 | PII-safe demo org                      | only anonymized demo data + no secret literal visible |
| 2 | Org-admin-gated learner creation       | learner-create succeeds and is confirmable            |
| 3 | Cross-beat values: pixels **and** DB   | every asserted value matches both                     |
| 4 | Kill loading splash everywhere         | zero spinners/skeletons in any frame                  |
| 5 | Wait for dashboards to populate        | all widgets show real values                          |
| 6 | Protect the hold for reg-code reveal   | code fully revealed and legible                       |
| 7 | Cursor bloom only on real clicks       | 1:1 bloom-to-click, no spurious blooms                |
| 8 | One scratchpad root, absolute paths    | single root, all absolute, all resolvable             |
| 9 | Match VO to the real screen            | VO, pixels, and article step agree per beat           |

---

## Generalization Smoke

Purpose: prove the skills are **not** secretly hard-wired to CommandIQ. The
skills ship in a marketplace plugin; a buyer will point them at their own app.

### Procedure

1. **Install from the marketplace.** Install the `mothy` plugin from the
   marketplace into a clean Claude Code session — do not run from the working
   tree. This catches anything that only works because of local, uncommitted
   state.
2. **Run `/video` on a TRIVIAL non-CommandIQ flow.** Pick something unrelated and
   tiny — e.g. a 2–3 beat walkthrough of a public to-do app, a Wikipedia search,
   or a calculator web app. Drive the real app, generate VO, assemble the video.
3. **Run `/article`** on the same captured flow → produce a Zoho Desk **Draft**
   (embedded video at top, one screenshot per click/type step beneath).
4. **Inspect the diffs you had to make.** Count how many edits were required to
   make `/video` and `/article` work on this non-CommandIQ flow.

### Pass criterion

- **PASS:** the run needed **zero** CommandIQ-specific edits — no hard-coded
  Vanguard org name, no CommandIQ URL baked into a skill, no demo-capture login
  assumed, no CommandIQ-shaped DOM selector required. Generalization holds.
- **FAIL:** any CommandIQ-specific value, selector, login, or assumption had to
  be edited for the trivial flow to work. File the leak as a bug against the
  offending skill before shipping.

> Note: CommandIQ-specific configuration (org names, instance URL, demo-capture
> identity, Zoho root category) is legitimate **input/config** to a run. The
> smoke fails only if that configuration is **baked into the skill body** rather
> than supplied as input.

---

## Mock-Blind Walls

These are live integration behaviors that a mocked test run will pass straight
through and never exercise. The Generalization Smoke MUST hit each one against
the **real** service, because each represents a documented limit we have
actually collided with. A mock that returns `200 OK` here is lying.

### Wall 1 — Zoho 403 on root-category create

- **Reality:** the Self-Client token **cannot create a root KB category** — Zoho
  returns **403**. You may only create *sections* under the existing root
  `Using CommandIQ` (or, for the smoke, under whatever root already exists).
- **Smoke must:** attempt the publish path and confirm `/article` reuses an
  existing root category and creates only a section — never tries to create a
  root and never swallows the 403 silently.
- **Mock-blind because:** a stubbed Zoho client returns a fake category id and
  the 403 path is never walked.

### Wall 2 — Zoho 404 on image upload

- **Reality:** the token **cannot upload images** to Zoho Desk — uploads return
  **404**. Workaround: embed each per-step screenshot as a **base64 `data:` URI**
  directly in the article HTML.
- **Smoke must:** confirm the published Draft renders its screenshots from inline
  `data:` URIs, with **no** call to the Zoho image-upload endpoint.
- **Mock-blind because:** a mock "upload" returns a hosted URL that works in the
  test but 404s against real Zoho.

### Wall 3 — Vimeo tus resume

- **Reality:** Vimeo uploads use the **tus** resumable protocol. A real upload of
  a non-trivial video will be interrupted and must **resume** from the last
  acknowledged offset, not restart from byte 0.
- **Smoke must:** upload the assembled video to Vimeo (Pro token, `upload`
  scope) and confirm a resumable tus session — ideally by interrupting and
  resuming — completes without re-uploading the whole file.
- **Mock-blind because:** a mocked uploader accepts the whole blob in one shot
  and never tests the resume offset math.

### Wall 4 — `data:` URI theme-strip

- **Reality:** Zoho's article editor / renderer **strips styling and attributes**
  from embedded HTML. An inline screenshot must survive as a bare `data:` URI
  `<img>` after Zoho strips theme/style; over-decorated HTML loses the image.
- **Smoke must:** confirm that after the Draft is saved and re-fetched, the
  inline screenshots still render — i.e. the `data:` URI img survives Zoho's
  theme-strip.
- **Mock-blind because:** a mock that echoes back the HTML you sent never applies
  Zoho's strip, so the stripped-attribute failure is invisible.

### Walls summary

| Wall | Real behavior              | Smoke proves                                  |
|------|----------------------------|-----------------------------------------------|
| 1    | Zoho 403 root-cat create   | reuse root, create section only, no swallow   |
| 2    | Zoho 404 image upload      | inline `data:` URIs, no upload endpoint call  |
| 3    | Vimeo tus resume           | resumable upload completes from offset        |
| 4    | `data:` URI theme-strip    | inline img survives Zoho strip on re-fetch    |

---

## Sign-off

A run is shippable only when **all nine §6 gates PASS**, the **Generalization
Smoke passes with zero CommandIQ-specific edits**, and **all four Mock-Blind
Walls are exercised live and behave as documented**. Record the run's scratchpad
root, the Vimeo URL, and the Zoho Draft id in the Demo Videos sheet tab.
