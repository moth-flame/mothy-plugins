---
name: video
description: Produce a narrated product-demo VIDEO by driving the real running app with Playwright, generating voiceover with ElevenLabs, and assembling with ffmpeg. Use when the user says "/video", "make a demo video", "record a product demo", "capture a walkthrough video", "make a sales/capability video of [flow]", or asks to reproduce a live demo as a recorded asset. Orchestrates parallel capture agents per beat, a synthetic cursor/finger-dot overlay, value-first VO, and a final live-render review. NOT for screenshots-only, GIFs, or editing an existing video file.
---

# video — narrated product-demo video producer

> Born from the 2026-06 CommandMRO demo build. The *engine* (capture → VO → assemble → review → deliver) is flow-agnostic; only the beat list + seed data + delivery destinations are flow-specific, and those live in a **flow config** (see CONFIG below), never hardcoded in this prose. Reusable tooling lives in `${CLAUDE_PLUGIN_ROOT}/skills/video/tooling/` (overlay lib, ffmpeg helpers, tts, assemble) — reuse it, don't rebuild it.

## When to use / not use

USE for: a multi-beat narrated screen-capture video of a real app flow, delivered as one MP4.
NOT for: a single screenshot, a silent GIF, editing/trimming an existing video the user supplies, or a slide deck (that's a different skill).

If the user asks for the **CommandMRO technical demo flow** specifically → use the bundled `commandmro` reference flow (the 9-beat flow documented in the reference appendix at the end), but FIRST confirm course + module(s) with the user, leading with a recommendation (see the appendix).

## CONFIG (per-flow)

The engine is driven by a **flow config**: a JSON file that carries everything flow-specific so a new demo can be produced **without editing this SKILL or the tooling**. The skill reads `skills/video/tooling/flows/<flowId>.config.json` (resolved under `${CLAUDE_PLUGIN_ROOT}`), validated against `skills/video/tooling/flows/flow.config.schema.json` (`schemaVersion: 1`).

**Default flow:** when the user names no flow, default to `commandmro.config.json` — the bundled CommandIQ reference flow (the 9-beat CommandMRO capability reel documented in the reference appendix). When the user names a flow (`/video <flowId>`), load `<flowId>.config.json`.

**NEW walkthrough with no ready flow — use the shared corpus, don't reinvent it (Rich, 2026-07-02).** There is ONE shared library of CommandIQ flow recipes (build spec + click path per walkthrough), shared by every surface (Cowork desktop, Cloud, Agent37) and reached through the mothy MCP actions. When a request has no ready flow config:
1. **Query the corpus first** — `mothy({action:"video_flow_kb",params:{query}})` — if a recipe already has the click path, reuse it. Never re-research what's already recorded.
2. Only for a genuine gap, research the real click path/selectors with `mothy({action:"commandiq_repo_intel",params:{question}})` (Agent37 reads a mirror of the CommandIQ repo; users have no repo access — never guess).
3. Contribute it back with `mothy({action:"video_flow_request",params:{title,description,click_path,audience}})` so the next request (any surface) reuses it. No DM, no human hand-off.

**Resolution order (lowest → highest precedence):**

1. **Engine defaults** — the flow-agnostic constants baked into this SKILL + the tooling (1920×1080 / 30fps / yuv420p / h264 / aac-48k output; `eleven_multilingual_v2`; the live-render review bar; the motion contract; the splash guard mechanics).
2. **`<flowId>.config.json`** — the flow's authored values override the defaults.
3. **Command-arg overrides** — anything the user passes on the invocation (or answers in the CONFIRM-SCOPE card) overrides the config for this run only; do NOT write run-time overrides back into the config file unless the user asks to persist them.

**What the config carries (one key per concern — see `flow.config.schema.json` for the authoritative shape):**

- `flowId` — stable machine id (kebab/lowercase); used for filenames, build-state keys, scope tags.
- `title` — human-facing video title (used in the delivery row + the article).
- `targetRuntimeSec` — inclusive `[min, max]` runtime window the orchestrator gates the final MP4 against (e.g. `[225, 255]` for a ~3:45–4:15 nine-beat reel).
- `narration` — `voiceName` + `voiceId` (null = resolve by name at runtime), `model` (`eleven_multilingual_v2`), and `style` (the narration directive, default: value-first / JTBD, plain-English, spoken full names not acronyms).
- `splash` — `anchorSelector` (a known post-splash element to poll for before any value action), `loadingText` (the literal loading copy to detect/forbid), `maxTrimSec` (cap on the auto-trim so a mis-detect can't eat real content).
- `app` — `baseUrl` of the running app, `auth` (`strategy` ∈ storageState | supabase-password | enrollment-blob | none, plus a `refresh` strategy), and `viewports.portal` / `viewports.tablet` capture sizes.
- `seed` — `strategy` (script | targeted-update | none), `scopeTag`, `fixedEnrollmentCode` (deterministic identity), `piiSafe`, and `demoOrgAllowlist` (the org names seeding/capture is permitted to touch). The seed *script* itself is a flow asset (`config.seed.strategy`), NOT vendored tooling.
- `beats[]` — the ordered cut list: each beat carries `id`, `title`, `surface` (portal | tablet), `voGist`, `waitFor` (the post-splash anchor for that beat), and `dependsOn[]` (lifecycle ordering — a post-state beat depends on the beat that mutates the state).
- `deliver` — `slack` (`channel` id + `dm` flag), `sheet` (`id` + `tab` + ordered `columns`), and `vimeo.privacy` (`view` + `embed`).
- `article` — the `/article` KB destination (`zoho`: `dc`, `orgId`, `rootCategory`, `permission`, `status`).

**In this SKILL's prose, every flow-specific value is referenced by its config key** — e.g. "wait for `config.splash.anchorSelector`" (not "wait for the *Loading assessment frameworks* splash"), "post to `config.deliver.slack.channel`" (not the bare channel id), "gate duration against `config.targetRuntimeSec`", "render VO in `config.narration.voiceName`". The CommandIQ values are preserved as the *documented example* in the reference appendix and in `commandmro.config.json`.

## The deliverable + acceptance bar

One MP4: 1920×1080, 30fps, h264/yuv420p + aac, continuous VO, all beats in order, no clipped narration, no raw IDs / debug / "preview/dummy/showcase" copy on screen. The bar is **the live-render review (§7)** — the orchestrator READS the rendered frames and judges them, not just ffprobe.

**NO human-approval pause (Rich, 2026-07-02).** The live-render review (§7) is the agent's OWN confidence gate — when it passes, publish to Vimeo (per `config.deliver.vimeo.privacy`, default unlisted) and hand over the link immediately; never park a finished render waiting for a human sign-off. The unlisted link is the safety valve, not a review queue. Only stop for a human when the review still FAILS after the bounded fix loop (then report the defects + the draft path instead of publishing). The remote Agent37 worker follows the same protocol (its pause mode is env opt-in `RENDER_QA_PAUSE=1`, default OFF).

**Delivery — Slack-DM the path AND publish to Vimeo + the team channel** (all destinations come from `config.deliver`). Once the MP4 passes the live-render review (§7), every /video run completes ALL of these (not optional):

1. **Slack-DM the user the final video path** (when `config.deliver.slack.dm`). Send the user a Slack DM containing the absolute path to the rendered MP4 (and a one-line recap of what it shows). Also surface it via SendUserFile when sensible.
2. **Upload the final MP4 to Vimeo** with `config.deliver.vimeo.privacy` — e.g. `view=unlisted` (not searchable / not on your profile) + `embed=public` (embeddable anywhere). See the Vimeo upload approach below.
3. **Post the resulting Vimeo link to `config.deliver.slack.channel`** (the CommandIQ default is `#product_and_customer_success`, channel id `C05T9FA39DE`), in addition to the DM-the-path step — a one-line "New demo: <what it shows> — <vimeo link>".
4. **Log the video in the tracking workbook.** Append a row to `config.deliver.sheet.tab` of workbook `config.deliver.sheet.id` (the CommandIQ default tab is **Demo Videos** in workbook `12MDZoe8QOjK-AYLRjUaiWRbFcblrdPVcmxzXJfvyhaE`). Create the tab if it doesn't exist, mirroring a sibling tab's structure/formatting. Write against the ordered `config.deliver.sheet.columns` (the CommandIQ default columns: **Visibility | Title | Runtime | Link | Notes** — Visibility = the Vimeo `view` value, Title = `config.title`, Runtime = `m:ss`, Link = the Vimeo share link, Notes = one-line what-it-shows). Slack and Sheets are brokered via the **Mothy MCP** (`slack_*` / `sheets_*` actions) — there is no local Slack/Sheets secret; use the MCP (or gogcli as a Sheets fallback).

**Vimeo upload approach (tus):**
- `POST https://api.vimeo.com/me/videos` with a Bearer token from the `VIMEO_ACCESS_TOKEN` env var (env-var-first; see Credentials). Body: `{ upload: { approach: 'tus', size: <bytes> }, name: config.title, privacy: config.deliver.vimeo.privacy }`. Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`, `Accept: application/vnd.vimeo.*+json;version=3.4`.
- The response returns `upload.upload_link` (a tus endpoint) and `uri` (`/videos/<id>`). **Upload the bytes via tus** to `upload.upload_link`: `PATCH` with `Tus-Resumable: 1.0.0`, `Upload-Offset: 0`, `Content-Type: application/offset+octet-stream`, body = the MP4 bytes (resumable — re-`PATCH` from the server-reported `Upload-Offset` if interrupted).
- The shareable link is `https://vimeo.com/<id>` (derive `<id>` from `uri`). Optionally `PATCH /videos/<id>` to set `name`/`description` after upload.
- **Requirements:** the token needs the `upload` scope (and `edit` if you set metadata after), Vimeo Pro, and Vimeo API uploads require a **paid Vimeo plan** — a free account 401/403s on `POST /me/videos`. If the upload can't run (no token / free plan), still complete the DM-the-path step and tell the user Vimeo needs a paid plan + an `upload`-scoped token.

## 0. Plan + confirm scope first

- If there's no flow config beat list, synthesize a beat list from the user's intent. For a configured flow, propose the beats + the course/module/data and **confirm with the user before capturing** (cheap to ask; expensive to re-capture).
- Lock these BEFORE capture: beat list + order (`config.beats`), narration style (`config.narration.style`; default: value-first / JTBD, plain-English, spoken full names not acronyms), the demo subject (course/module/learner), voice (`config.narration.voiceName`), target runtime (`config.targetRuntimeSec`), and the ending.
- **CONFIRM-SCOPE gate (required):** before ANY capture, present a single `AskUserQuestion` card summarizing **beats + subject + voice + runtime**, with options **[Capture it] [Edit beats] [Change voice] [Cancel]**. Do not start the SPIKE or any capture until the user picks **Capture it** (or edits and then confirms). One card — cheap to ask, expensive to re-capture.
- Write a build-state file (`docs/drafts/<date>_<flowId>-build-state.md`) tracking each beat → pending|captured|done, the seed identity, server pids, and decisions. Durable across disconnects.

## 1. The pipeline (stages)

```
plan/confirm-scope → SPIKE (go/no-go) → tooling → seed → capture per-beat (parallel)
            → VO render → assemble (splash-trim→normalize→speed-match→mux→concat) → LIVE-RENDER REVIEW (glitch + splash scan) → fix/iterate → deliver (Slack-DM path + Vimeo + post to config.deliver.slack.channel + log to config.deliver.sheet)
```

**Always SPIKE first.** Before building N beat scripts, prove the chain end-to-end on ONE beat: servers up, login works, the target screen renders with real data, ElevenLabs returns audio, one bare capture records. A go/no-go spike saves you from building N scripts against an uncapturable environment. Caveats it surfaces (empty cohort, missing account, voice unavailable) are cheaper to fix now.

## 2. Orchestration (orchestrator-only — same model as `/build`)

**This skill runs orchestrator-only, exactly like `/build` (see `/build` SKILL.md §0.6, §2, §5 + the repo `CLAUDE.md` / `AGENTS.md` "Orchestrator-only mode").** The main thread is a conductor, not a performer. It fans EVERY execution step out to focused background sub-agents and keeps its own context free for orchestration decisions (priority, dependencies, merge, re-dispatch). This is not opt-in for the capture stage only — it covers the WHOLE pipeline: capture, VO, assemble, AND deliver.

**The main thread does ONLY these things (nothing else):**
- Plan the beats + run the CONFIRM-SCOPE card with the user.
- Write the sub-agent briefs and dispatch them.
- Read sub-agent summary reports (NOT raw transcripts) and the rendered artifacts (per-beat thumbnail frames / draft cuts) for the live-render review (§7).
- Make decisions: priority, dependency sequencing (`config.beats[].dependsOn`), merge, re-dispatch on a failed gate.
- Write the final user-facing summary.

**The main thread does NOT itself perform ANY execution step.** Every one of these is dispatched to a sub-agent — these were historically done in the main thread and MUST NOT be:
- **Capture** — driving browsers / Playwright `recordVideo`, injecting the overlay, waiting out the splash.
- **VO** — calling ElevenLabs (voice resolve + per-beat TTS render).
- **Assemble** — running ffmpeg (normalize / splash-trim / speed-match / pillarbox / mux / concat) and producing the GATE-C thumbnails.
- **The ENTIRE delivery stage (§"Delivery")** — the Vimeo upload (tus), the Slack channel post + the user DM, and the Google sheet append. Plus any OAuth / token exchange or connection test these need.

**The ONLY tool calls allowed directly in the main thread** (matching `/build`'s carve-outs): `TodoWrite`; `AskUserQuestion` (the CONFIRM-SCOPE card + when blocked); dispatching agents (writing the briefs); reading sub-agent reports; reading rendered frames / draft-cut previews for the live review (§7); and the final summary. Anything that touches a browser, ffmpeg, ElevenLabs, Vimeo, Slack, a sheet, or a token goes to a sub-agent.

**Dispatch pattern (per `/build` + the repo guidance):**
- **One agent per beat** (capture), **one per stage** (VO render, assemble, deliver), or per tight cluster sharing a login/pattern. Each owns explicit files (`scripts/demo/beats/NN-<beat.id>.mjs`, etc.) and carries an explicit **"do not touch" list** so parallel agents don't collide.
- **Run in background and fan out independent work in a single message** (separate messages serialize them). Sequence DEPENDENT stages: VO waits on the captured/reviewed screens (§5), assemble waits on VO + captures, deliver waits on the passed live-render review (§7). A post-state beat waits on the beat that creates the state (`config.beats[].dependsOn`).
- **Every agent reports its gate verdict before finishing** — capture agents report **GATE-B** (the beat's `config.beats[].waitFor` element rendered + overlay moved + no error) with the webm path + a screenshot; the assemble agent reports **GATE-C** (ffprobe: resolution, both streams, audio not silent, duration in `config.targetRuntimeSec`) with the per-beat thumbnails.
- **Review each agent's output before merging** — read the GATE-B screenshots / GATE-C thumbnails and judge them (§7); re-dispatch any beat/stage that failed its gate rather than papering over it.
- **Secrets stay env-var-first and gitignored, and are never printed by agents.** ElevenLabs / Vimeo tokens resolve from env first (see Credentials); brief every agent to read them from there and never echo them into a report, log, or committed file. Slack / Sheets are brokered via the Mothy MCP (no local secret).
- Capture artifacts (webm/mp3/mp4) live in the **session scratchpad**, never the repo. Only the reusable scripts get committed; `.gitignore` excludes `out/ .state/ *.webm *.mp4 *.mp3`.

## 3. Capture mechanics

- **Playwright `recordVideo`** (headless is fine; retry headed only if charts/canvas don't paint). `recordVideo:{dir,size:{1920,1080}}`. NOT avfoundation (perm-gated, leaks desktop, non-deterministic). NOT screenshot-frames (stutters).
- **C1 — NEVER drive the app through full-page reloads. Single-session capture is the default.** One-context-per-beat means a fresh login + boot splash + black per beat — ~6 reloads shipped in one cut that way (house-QA defect #1, 2026-07-08). Run the WHOLE flow in ONE browser context; navigate between beats via in-app SPA transitions (click real nav / hash assignment — same-document, no reload). Record ONE master video and mark per-beat shot WINDOWS in wall-clock time — a window opens only AFTER the beat's real content anchor (`config.beats[].waitFor`) is visible + settled — then slice per-beat segments from the master. A flow declares this via `config.capture = { mode: "single-session", runner: "<runner-script>" }`. If a reload is truly unavoidable, close the window before it and re-open after content returns: the slicer hard-cut bridges the gap and the beat's continuous VO carries over it. **Never leave a splash/black frame in the cut.**
- **C6 — plan a SHOT LIST so each navigation/click path appears ONCE.** Never re-open the same modal/editor across beats — order beats so state persists (author both halves of a paired item in ONE editor open; create+name a container and fill it in ONE modal open). The same modal opening 3× reads as a broken loop.
- **Portal/desktop beats:** viewport `config.app.viewports.portal` (e.g. 1920×1080, or 1280×720 @2x for crisp punch-in crops).
- **Tablet beats (mobile PWAs):** capture PORTRAIT at `config.app.viewports.tablet` (e.g. ~390×844 @3x); the assembler pillarboxes onto the 1920×1080 dark canvas. Don't capture a phone surface at desktop width.
- **Reuse login** per `config.app.auth.strategy` (e.g. `storageState`) across beats so each starts already-authed. Refresh expired tokens per `config.app.auth.refresh.strategy` (e.g. the Supabase `refresh_token` grant) and write the new session back.
- **REQUIRED — wait out the app's loading splash before recording meaningful action.** Many apps show a branded loading splash on boot AND on some in-app navigations. It is non-value-added and must NEVER appear in a final cut. Every beat that boots or navigates must **poll for `config.splash.anchorSelector`** (or the beat's own `config.beats[].waitFor`) — a real screen anchor — and only start the value action once it's visible. Do not start narration-relevant motion against the splash. Capturing into the splash is the #1 cause of dead/branded frames; the assembly pass also trims any that slip through (§6), but capture-side waiting is the primary defense. (CommandIQ example: the "*Loading assessment frameworks…*" splash on boot and on `/lxp → /` navigation — see the reference appendix.)

## 4. The cursor / finger-dot overlay (the keystone)

Use `${CLAUDE_PLUGIN_ROOT}/skills/video/tooling/lib/overlay.js`:
- **DOM-injected** via `page.addInitScript` onto `document.documentElement` (NOT the React root) with `position:fixed; pointer-events:none; z-index:2147483647` so SPA/Expo re-renders never wipe it, and it's captured natively (no post-compositing).
- **Two visually distinct skins** — portal = sharp CYAN arrow + click ring; tablet = translucent AMBER finger-dot + tap ripple. Distinct shape AND color so a viewer can tell device-from-pointer alone (both surfaces are dark).
- **Motion contract:** never teleport; ease; dwell ≥250–280ms BEFORE the click (viewer's eye arrives first); ~400ms hold after; finger ~15% slower than cursor.
- **The click ring / tap ripple fires ONLY on a real click — never on dwell or movement — so the cursor never looks like it's clicking non-interactive elements.** `moveToSelector(..., { realClick: true })` (the default) is the only path that draws the bloom; `realClick: false` (point/hover without clicking) moves + dwells + holds but draws NO ring. Don't call `clickAt()` directly except alongside an actual page click.
- `moveToSelector(page, selector, {skin})` takes a STRING selector; for filtered/role Locators write a small local `pointTo(page, locator)` helper with the same motion contract. Re-assert / re-inject the overlay after navigations.
- **C8 — cursor discipline: the cursor tracks the REAL action, and ONLY the action.** Move the synthetic overlay and the real Playwright pointer together; clear hover state between beats. The cursor must NEVER park over a heading/title/logo while nothing is being clicked there (a parked cursor over a heading reads as a broken click). Choreograph moves only to fields, buttons, rows — the things the narration is about.

## 5. Voiceover (ElevenLabs)

**Narration principle — value-first, the hard rule.** VO emphasizes ONLY three things, and every line must answer the customer's *"what does this do for me?"*: **(a) how the feature works**, **(b) the value it delivers**, **(c) the customer's job-to-be-done** (this is what `config.narration.style` defaults to). **NEVER narrate internal UI / design-implementation details** — line routing, why an element sits where it does, color/spacing/positioning choices, "the lines never intersect", visual-polish rationale, framework internals, or how it was built. That is *builder guidance*, not customer value. **Litmus test: if a visual detail doesn't change what the user can DO or decide, it does not belong in the VO.** (Origin: a Career Map reel narrated that the subway lines "never intersect" — pure styling guidance the customer does not care about.) Keep this consistent with the pacing rules below: one voice, pacing matched to the beats, no dead air, spoken full names not acronyms.

- **Raw REST** `api.elevenlabs.io/v1/text-to-speech/{voice_id}` with the `xi-api-key` header (key from the `ELEVENLABS_API_KEY` env var — strip surrounding quotes; see Credentials). There is NO Node TTS SDK; `@elevenlabs/react` is browser-only. Use `${CLAUDE_PLUGIN_ROOT}/skills/video/tooling/tts.mjs`.
- Model `config.narration.model` (`eleven_multilingual_v2`). **C4 — HOUSE VOICE for CommandIQ assets: ElevenLabs 'Eric', voice id `cjVigY5qzO86Huf0OWal`** (the CommandIQ overview + career videos voice) — set `narration.voiceName: "Eric"` + `narration.voiceId: "cjVigY5qzO86Huf0OWal"` in the flow config. An explicit `voiceId` always wins over name lookup (tts.mjs passes an id through untouched); resolve by `voiceName` (`GET /v1/voices`) only when the id is null. Never ship the generic default narrator on a CommandIQ asset.
- **C4b — QA the generated VO BEFORE assembly.** STT-transcribe each rendered `vo-<id>.mp3` (ElevenLabs scribe_v1 / whisper) and compare it to the script line: duplicated/stuttered words, garbles, and any WER-visible deviation (the "before survey at enrollment" → "add enrollment" class) FAIL the line → re-render ONLY that line (credit discipline), bounded; a line that stays bad hard-fails the VO stage.
- **C5 — GENERIC-IZE identifiers in the VO.** Never voice an org name, slug, username, or person name — say "the organization", "an org admin", "a team". Full sentences only (dangling fragments like "Learning gain, measured." TTS-garble into duplicated tails). On-screen org/user chrome that can't be framed out is tolerated FOR NOW — but it must never be SPOKEN. Keep a `config.qa.piiTerms` list; the transcript gate (§7c) hard-fails if any term is voiced, and the OCR sweep (§7a) warns when one is visible on screen.
- One mp3 per beat + a durations manifest (ffprobe).
- **VO copy must match what's actually on screen.** Capture or screenshot the beats first, THEN finalize VO — live data often differs from `config.beats[].voGist` (e.g. "unclassified" docs were all CUI; "custom framework button" was inline sliders; an IMI was gauge-reading not hazard-spotting). Reconcile copy before rendering. Spoken full dimension/feature names per `config.narration.style`, never acronyms.

## 6. Assembly (ffmpeg) — `${CLAUDE_PLUGIN_ROOT}/skills/video/tooling/assemble.mjs` + `lib/ffmpeg.mjs`

- **Normalize EVERY segment** to identical params (1920×1080 / 30fps / yuv420p / h264 / aac-48k / setsar=1) — required for clean concat.
- **Pillarbox** portrait/tablet beats onto a dark canvas (`#07111f`), centered.
- **Sync per beat (avoid dead air AND clipped VO):** if video ≤ VO+1s → freeze-pad last frame to VO length; if video > VO+1s → SPEED UP via `setpts=PTS/factor` to VO+~1.5s (cap ~1.7×; sped-up navigation reads as brisk, loses no content). Pad audio with lead-in + trailing silence so nothing clips. Report any beat that hits the speed cap (its VO is too short for its footage — trim or re-narrate).
- **Concat demuxer** after normalization (all params identical). Optional 0.4s cross-dissolves; prefer a clean hard-cut demuxer over a fiddly broken xfade.
- **REQUIRED — trim any loading splash that slipped in.** Even with capture-side waiting (§3), mid-beat navigations can leave a few leading splash frames. Before normalizing each beat, run the splash guard: `trimSplashHead(inFile, outFile)` in `lib/ffmpeg.mjs` detects a leading run of near-static dark frames followed by the first big scene-cut (`detectSplashHead` → `select='gt(scene,…)' ,showinfo`, capped at `config.splash.maxTrimSec` so a mis-detect can't eat real content) and head-trims to that point; `trimHead(in, out, seconds)` is the manual escape hatch when you've eyeballed the exact cut. **Never leave the loading splash (`config.splash.loadingText`) in a final cut.** If a beat still shows the splash after the auto-trim, re-capture it (the navigation landed before `config.splash.anchorSelector` painted).
- A short generated **bridge card** (1920×1080 still held for its VO length, gentle fade) covers a step you don't capture live (e.g. a VR runtime) — keeps the journey continuous without the live glitch risk.
- **GATE-C:** ffprobe asserts resolution, both streams, audio not silent (mean_volume > −50dB), duration in `config.targetRuntimeSec`. Export per-beat **thumbnail frames** for the review.

## 7. Live-render review (MANDATORY — the real gate)

After assembly, the ORCHESTRATOR **Reads the per-beat thumbnail frames** (and spot-checks the MP4) and judges the rendered pixels: right screen + right data, overlay moved + clicked, legible at 1080p, no raw IDs / "Untitled" / debug / placeholder copy, code/identity consistent across beats, narrative coheres. A green GATE-C is NOT enough — it passes on a visually broken surface. Re-capture or fix anything that doesn't match intent before delivering.

- **REQUIRED — scan for Playwright-induced UI glitches.** Automated browser driving leaves artifacts a real user never sees. Check every beat for: **stray focus rings** (a blue/cyan outline stuck on a button or input after a programmatic click), **half-loaded / empty states** (a skeleton, spinner, blank card, or zero-data table the capture caught mid-fetch), **scrollbar jumps** (the page scroll position snapping when `scrollIntoViewIfNeeded` fired), and **hover states stuck on** (a row/button frozen in its hover style because the synthetic cursor is `pointer-events:none` and never emits a real `mouseleave`). **Re-capture any beat that shows them** — blur the focused element / wait for the loaded state / settle the scroll before recording, or move the synthetic cursor off the element before the hold frame.
- **REQUIRED — no loading-splash frames anywhere in the cut** (§3 capture-wait + §6 auto-trim). If a thumbnail or spot-check shows the splash (`config.splash.loadingText`), the beat failed — re-capture or re-trim it.

### 7a. Automated A/V integrity gates (run on EVERY assembled cut — non-negotiable)

Frame-sampling by eye misses whole-timeline defects (a black open under VO shipped past a beat-by-beat check). These `ffmpeg` passes are deterministic, cheap, and catch what eyes don't. A cut does not ship until ALL pass — and they are re-run on the **live downloaded file after upload** (§7b), not just the local assembly.

- **Black-under-audio** — a black/blank screen while VO plays (the exact class that shipped a **6.6s black open**). Run:
  `ffmpeg -i cut.mp4 -vf blackdetect=d=0.3:pix_th=0.10 -an -f null -`
  Cross-reference every reported `black_start/black_end` against the audio track. **Any black span ≥0.5s that overlaps VO/audio is a FAIL.** An intentional fade-in stays <0.5s. Fix by filling the black with the adjacent real footage from t=0 (or the intended title card) — never by trimming the VO to hide it.
- **Silent-under-video** — the reverse: sustained video playing with NO voiceover/audio (a dead-air hole or a dropped VO line). Run:
  `ffmpeg -i cut.mp4 -af silencedetect=noise=-40dB:d=1.5 -f null -`
  **Flag any `silence_duration` ≥1.5s that occurs while non-black video is on screen.** Distinguish an intentional beat-pause (short, ≤~1.2s — fine) from a missing-VO hole (fix by adding/repositioning the VO or shortening the beat). Every sustained visual beat should have narration over it.
- **Sentences running together — too LITTLE silence between separate VO clips.** When separately-rendered VO lines are concatenated edge-to-edge, they sound like one run-on sentence (real failure: `"…minutes, not weeks."` butted straight into `"Open a position…"` with no gap). This is the inverse of silent-under-video and `silencedetect` alone won't catch it (there's no long silence — there's *not enough*). **Detect via word-level STT** (§7c): at each sentence boundary — the last word of one sentence → the first word of the next, and ESPECIALLY at every seam between two distinct VO clips — compute `gap = start_next − end_prev`. **Flag any inter-sentence gap < ~0.35s as a run-together FAIL.** (A comfortable inter-sentence beat is ~0.4–0.7s.) **Prevention (assembly, §6):** the assembler MUST insert a minimum **~0.5s of silence pad between every distinct VO clip** — never concatenate two VO files with no gap. Fix an existing run-together by inserting the pad at the offending seam (push the later clip + its video later, or add silence to the tail of the earlier clip).
- **A/V presence + parity** — `ffprobe` the file: it MUST have both a video AND an audio stream, and **video duration == audio duration** (a video that ends before its VO finishes, or trails silent after it, is a FAIL).
- **Single continuous voice, no clipping** — `ffmpeg -i cut.mp4 -af volumedetect -f null -`: consistent `mean_volume`, `max_volume` not pinned near 0 dB (clipping), no loudness jump at beat seams (a spliced-in beat that wasn't loudnorm-matched).
- **OCR sweep (R5)** — OCR-sample frames across the WHOLE cut (~1 per 6s) and scan the text for: loading splashes/spinners (`Loading…`, `config.splash.loadingText` — any hit = FAIL), on-screen PII from `config.qa.piiTerms` (warning; the VOICED form is the §7c hard fail), and a cursor parked off-target. Codex vision (`codex exec --image`) works as the OCR extractor where tesseract isn't installed.
- **Branded OPEN + OUTRO cards (C7)** — every flow ships a branded title card up front and an outro card (title + wordmark text is fine; `config.branding` block with optional per-card VO). Card length is VO-driven with a <1.5s tail so a card can never trip the dead-air gate — **no dead-air tail, no abrupt stop on a data table.**

### 7b. Verify the SHIPPED artifact — not the report, not a stale local file

- **A sub-agent's "done" is a claim, not proof.** Local scratch gets cleaned mid-session and a stale local `.mp4` won't reflect what actually uploaded. After any Vimeo **replace-in-place**: (1) confirm via the Vimeo API that a genuinely NEW version transcoded — new version id, `transcode:complete`, expected `duration`; (2) **download the live rendition** and run the §7 frame checks + §7a integrity gates + §7c transcript on THAT file. Never report a video done off the agent's word or an old local copy.
- **Locate a defect densely, don't luma-average.** To find a brief splash/black/glitch, scan frames every ~0.3s across the suspect window (or the whole file) — a montage/average-brightness check misses a 2–3-frame flash. Pin the exact start/end timestamps, then cut cleanly.

### 7c. VO says what it should — transcribe, don't assume

ElevenLabs render can silently diverge from the script (the word "seed" came out **"see to"**; a "roadmap" line survived a requested rewrite). **Transcribe the FINAL audio** (ElevenLabs STT / whisper, word-level) and scan the actual spoken text for: (a) correctness of the key words/claims, (b) any forbidden language (e.g. "coming soon / roadmap / beta / on the way" when the ask was plain present-tense), (c) VO↔visual sync (the line lands over the beat it describes). **The transcript — not the script you fed in — is the source of truth for the VO.**

### 7d. Orchestrator owns the pass/fail

The "look with your own eyes" judgment stays with the orchestrator: the capture agent renders + reports a one-line verdict, but the orchestrator makes the §7/§7a/§7c pass/fail against the checklist before it reaches the user. **If it's not clean, fix it first — never surface a video the user has to QA for you.**

## 8. Seeding + data discipline

- **Demo-seed writes are PRE-AUTHORIZED — do not stop to ask, and never brief a capture agent "read-only, no writes."** When a beat needs data that isn't there (a failing run, a pending recommendation, a learner state), CREATE it — this is a demo org and seed data is re-creatable + reversible (a 2-way door). Rich's standing rule (2026-07-02): *any time seeded data needs to be created for a demo org, the agent is authorized to create it.* Scope = the orgs on `config.seed.demoOrgAllowlist` (demo orgs / dev tenants only); NOT prod, NOT real customer data; still honor hard security gates (a secret/confirmation-code is a control — request it, never bypass) and never destructive ops on real (non-seed) data.
  - **Put the authorization in the capture agent's ORIGINAL brief** ("you are authorized to create/seed scoped, reversible demo data in this demo org — proceed without asking"). A blanket "read-only" clause in a sub-agent brief becomes an *unliftable* boundary: the harness will NOT let a coordinator follow-up (relaying the user's approval) override a boundary the agent's own prompt set, so the task deadlocks. If discovery must precede the write, phrase it as "read-only until you confirm the target, THEN you are authorized to write the scoped seed" — in the same first prompt.
  - If an agent is already deadlocked this way, don't keep relaying approval to it (every relay is rejected) — dispatch a FRESH agent with the authorization baked into its first prompt, reusing the staged artifacts.
- **Additive + idempotent + scoped teardown.** Tag synthetic rows with `config.seed.scopeTag` (e.g. `scoring_model='vr_mock'`, `is_testing=true`) so a `--reset` removes ONLY them and never real data (Rule 23/56). Never delete a learner.
- **Deterministic identity.** Use `config.seed.fixedEnrollmentCode` so the same learner reads identically across pre- and post-state beats (a random code re-mints and breaks on-screen continuity). Human-friendly alphabet (no 0/O/1/I/L/5/S).
- **Lifecycle ordering.** A pre-review beat and a post-review beat need the SAME learner at two states (encoded as `config.beats[].dependsOn`). Capture the pre-state, then the mutating action (e.g. approve), then the post-state — or update state in place (targeted UPDATE, `config.seed.strategy='targeted-update'`) rather than reseeding (a reseed re-mints and cascades into already-captured dependent beats).
- **Stay inside `config.seed.demoOrgAllowlist`** — seeding/capture may only touch the org names on the allowlist.
- Seed via the flow's own **`config.seed.strategy`** script (e.g. direct service-role pg inserts mirroring an existing seed script) — don't stand up extra infra for data, and don't vendor a flow's seed script into the shared tooling.

## Credentials (env-var-first)

Resolution order for every secret: **env var → `$MOTHY_STATE_DIR` → `~/.mothy/.state/<file>.json`**. Secrets stay gitignored and are NEVER echoed by sub-agents into a report, log, or committed file.

- **ElevenLabs:** `ELEVENLABS_API_KEY` (strip surrounding quotes — the value is sometimes wrapped in double-quotes). Fallback file: `.env.local`.
- **Vimeo:** `VIMEO_ACCESS_TOKEN` — needs Vimeo Pro + the `upload` scope (and `edit` if you set metadata after). Fallback file: `~/.mothy/.state/vimeo-creds.json`.
- **Slack + Google Sheets:** brokered via the **Mothy MCP** (`slack_*` / `sheets_*` actions) — **no local secret**.
- A flow that SEEDS data may also need its DB creds (e.g. `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_DB_URL`), resolved the same env-var-first way; only the seeding strategy needs them.

## Dos and Don'ts

DO:
- Run the CONFIRM-SCOPE card before building all beats. Confirm course/module before capturing.
- One agent per beat, explicit file ownership, background, GATE-B per beat (`config.beats[].waitFor`).
- Reuse `${CLAUDE_PLUGIN_ROOT}/skills/video/tooling/`. Deterministic seed identity (`config.seed.fixedEnrollmentCode`). Additive + scoped teardown (`config.seed.scopeTag`).
- Match VO to the actual rendered screen (review captures first).
- Wait out the loading splash on every boot/navigation (poll `config.splash.anchorSelector`) and auto-trim any that slip in (§6).
- Live-render review the thumbnails before delivering: scan for Playwright glitches (stray focus rings, half-loaded states, scrollbar jumps, stuck hover) AND splash frames — re-capture anything that shows them. Speed-match over-long beats.
- Deliver every run via `config.deliver`: Slack-DM the path, upload to Vimeo with `config.deliver.vimeo.privacy`, post the Vimeo link to `config.deliver.slack.channel`, log a row to `config.deliver.sheet` — all via a dispatched DELIVERY sub-agent (§2), never run from the main thread.
- **Adversarially verify any REAL product code you change** (an auth endpoint, a shared resolver) — test-blind diff+rubric, fix high+ findings, re-verify. The verifiers on the last build caught an IDOR, a dead-code key mismatch, and a cross-course scope leak that all passed green tests.
- Commit demo scripts + any product fix LOCALLY as separate logical commits; never push (the user pushes). Product fixes are cherry-pickable independent of demo tooling.

DON'T:
- Don't capture with a vite-only `npm run dev` expecting `/api` to work, or reach for `vercel dev` (see the reference appendix for the shim).
- Don't use a random enrollment code (breaks cross-beat continuity) or reseed mid-flow when a targeted UPDATE suffices (reseed re-mints + cascades into captured beats).
- Don't blind-pad over-long beats (dead air) or trim a beat through a reveal the VO references.
- **Don't narrate internal UI / design-implementation detail in the VO** — line routing, positioning/color/spacing choices, "the lines never intersect", visual-polish rationale, framework internals, or how it was built. Narrate only how the feature works, its value, and the customer's job-to-be-done (§5). If a visual detail doesn't change what the user can DO or decide, it stays out of the narration.
- Don't commit video binaries. Don't ship a beat that failed GATE-B or weaken the gate silently.
- Don't put raw UUIDs / "Untitled" / debug / "preview/dummy/showcase" copy on screen.
- Don't leave the loading splash (`config.splash.loadingText`) in a final cut, and don't ship a beat with a Playwright glitch (stray focus ring, half-loaded/empty state, scrollbar jump, stuck hover) — re-capture it.
- Don't fire the cursor click ring/ripple on hover or dwell — only on a real click (the overlay enforces this; don't call `clickAt()` outside a real click).
- Don't commit the Vimeo token; keep it env-var-first + gitignored. Vimeo API upload needs the `upload` scope + a paid plan.
- Don't change RLS policies or grant privileges to make a capture work (auto-denied + a security decision) — fix via a properly-authorized service-role path or realistic seed data, or escalate.
- Don't have the main thread drive browsers / write capture code / run ffmpeg / call ElevenLabs / upload to Vimeo / post to Slack / append the sheet — every execution step is a dispatched sub-agent (§2). Main only plans, briefs, reads reports + rendered frames, decides, and writes the final summary.
- Don't trust a capture agent's self-reported code/value for cross-beat continuity — read it off the rendered frame + DB. Don't ship a reveal where the cursor covers the value, or a landing dashboard that lists a real learner's name.
- Don't write to prod without explicit per-write authorization; do read-only discovery first, then one scoped write.

## Reusable assets (vendored tooling)
`${CLAUDE_PLUGIN_ROOT}/skills/video/tooling/`: `lib/overlay.js` (synthetic cursor — click ring fires only on real clicks), `lib/ffmpeg.mjs` (normalize/mux/concat + `detectSplashHead`/`trimHead`/`trimSplashHead` splash guard), `lib/urlbar.js` (synthetic browser address bar), `tts.mjs`, `assemble.mjs`. The flow configs + schema live at `tooling/flows/<flowId>.config.json` + `tooling/flows/flow.config.schema.json`. Per-beat capture scripts (`beats/NN-<beat.id>.mjs`), the `vo-script.json`, the seed script, and any local api-server shim are **flow assets**, NOT vendored shared tooling — generate them per run into the session workspace (the seed script is `config.seed.strategy`). Start from the vendored libs; never rebuild them.

---

# Reference flow — CommandIQ (Vanguard demo orgs)

> This appendix is the bundled `commandmro` reference flow. Its values are the documented examples the flow-agnostic engine above references by config key. The flow config is `tooling/flows/commandmro.config.json` (the default when no flow is named). The content below is preserved verbatim from the CommandMRO build for fidelity.

## Demo-capture login (no CommandIQ repo access needed)

You do **not** need CommandIQ repo access to capture this flow. Log in to the live app as the demo-capture user:

- **App:** `https://dev-commandiq.mothandflamevr.com`
- **User:** `demo-capture+vanguard@mothandflame.test`
- **Password:** read from the `COMMANDIQ_DEMO_CAPTURE_PASSWORD` env var **at runtime** — **NEVER** write the literal password into any file, brief, log, or committed artifact.
- **Orgs (demo allowlist, anonymized PII-safe data):**
  - **Vanguard Defense Group** = the **strategic** (leadership / readiness) flow.
  - **Vanguard Sustainment** = the **technical** (CommandMRO / maintenance) flow.

## The CommandMRO 9-beat flow

If asked for the technical/CommandMRO demo flow, replicate these 9 beats (value-first VO, throughline "assessment → evidence → readiness → personalized path back to ready"; close on the personalized path):

1. **Mission Control** (dark, technical) — cohort readiness, 6 capability bars, who needs attention / reviews waiting.
2. **Course Builder + advancement rule** — open the block → module → the assessment settings (per-dimension minimums + on-fail routing: AI-auto / instructor-approved / specific) + the remedial pool.
2b. **Doctrine + Framework** (mid-video governance proof point) — controlled source material + the 6-capability framework weights (Safety & Compliance highest).
3. **LXP path** (learner tablet) — the personalized path, "up next / awaiting review / locked".
4. **IMI runner** — hands-on familiarization (e.g. ground power cart gauges / in-band voltage).
5. **VR bridge card** — "Assessment complete — results sent to CommandIQ" (don't capture the headset runtime).
6. **Learner session review** (instructor) — per-dimension breakdown (failing dims red), audit trail, course rollup.
7. **Instructor adaptive review** (HERO) — AI recommends ~3 targeted refreshers per failed dimension; instructor curates/overrides; "AI recommends, the instructor approves."
8. **Back to LXP** — the newly-assigned refreshers now on the personalized path (the payoff).

**ALWAYS confirm course + module(s) before capturing**, leading with this recommendation (default, from the GAL build):
- Course: **C-130 Maintenance Foundations**.
- Block/IMI: **External Power System** → **Ground Power Cart Output Basics** (`su-02` / `EP-SU-02`, the Vite IMI runtime at `/imi/su-02`).
- VR assessment: **EP-VR-ASSESSMENT** (`engine_review` on-fail + per-dim minimums 70, 22-module remedial pool).
- Failed dims to seed: **Task Proficiency / Systems Understanding / Safety & Compliance** below 70.

Ask via AskUserQuestion: "Use C-130 Maintenance Foundations + the External Power System / Ground Power Cart flow (recommended), or a different course/module?"

## Environment gotchas (learned the hard way)

- **Instructor portal** = Vite SPA, `npm run dev` → `localhost:3000`, hash routing, Supabase email/pw, technical org → dark layout. **Learner LXP** = Expo, `cd apps/mobile && npx expo start --web` → `localhost:8081/lxp`. **IMI** = Vite `/imi/<module>` (Rule 36 — the Vite runtime is what prod iframes; the Expo IMI manifest may differ).
- **`npm run dev` is vite-only — `/api/*` are NOT served.** `vercel dev` is UNUSABLE here (`vercel.json` > 128 builds → hard error). Stand up a tiny Node shim that mounts the real `api/*.js` handlers against `.env.local` on `:3001`; metro proxies `/api/*` → `:3001` for the Expo LXP. (The shim lives in `scripts/demo/.state/api-server.mjs` from the last build — a flow asset, gitignored, not vendored tooling.)
- **Known demo logins (seeded, ready to use — no need to re-mint for local capture).** These are the instructor-portal email/password accounts that authenticate against the **iicwt dev** project (`https://iicwtetojqokdkrmqoab.supabase.co`), which is what `localhost:3001` / the local portal points at (`.env.local`). Both were provisioned via the **GoTrue Auth Admin API** (`POST/PUT {SUPABASE_URL}/auth/v1/admin/users` with `email_confirm:true`) — NOT raw-SQL `crypt()`, which GoTrue rejects on login. Both verified HTTP 200 on the password grant. Passwords resolve from env vars **at runtime** (same rule as the demo-capture login above — NEVER write a literal password into any file, brief, log, or committed artifact).

  | account (email) | password source | environment | org / product_line | notes |
  |---|---|---|---|---|
  | `buyer-demo@meridianhealth.test` | `COMMANDIQ_ADMIN_CAPTURE_PASSWORD` env var | local → iicwt dev | Apex Aerospace MRO · `strategic` | **PRIMARY demo login** — full seeded data (course, learners, positions/career-map, SCORM/HIPAA, compliance). `role=instructor`, `org_role=admin`. Display name "Elena Marchetti". |
  | `ciq-demo@commandiq.test` | `COMMANDIQ_SUPERADMIN_CAPTURE_PASSWORD` env var | local → iicwt dev | Apex Aerospace MRO · `strategic` | Fallback demo login. `role=instructor`, `org_role=admin`, `is_super_admin=true` (can navigate all demo orgs). Wired to the same seeded org as buyer-demo. |

  - The org id is `d0000000-0000-4000-a000-000000000001` (the seed's original "Meridian Health Systems" org, later renamed "Apex Aerospace MRO"; slug `apex-aerospace-mro-buyer-demo`). It carries the `.ciq-seed.mjs` + `.ciq-seed2.mjs` demo content.
  - **sb-gov (deployed dev) HAS these accounts too (verified 2026-07-01: password grant 200 for both against `https://dev-commandiq-sb-gov.mothandflamevr.com`).** buyer-demo = org_role=admin on the Apex org (display name there is "Dana Whitfield"); ciq-demo = is_super_admin=true + Apex admin. The Apex org + "MRO Program Management Leadership Track" course exist on sb-gov. Prod (`nkxbvimkxejkoecmujei`) does NOT have them — provision separately per the "Capturing against PRODUCTION" section below.
  - **Org traversal rule:** when a capture needs an org the org-admin account (`buyer-demo`) isn't a member of, use the SUPER-ADMIN login (`ciq-demo@commandiq.test`, `is_super_admin=true` on BOTH iicwt and sb-gov — verified 2026-07-01) — it traverses every org in CommandIQ. On Agent37 the pair is `COMMANDIQ_SUPERADMIN_CAPTURE_EMAIL`/`_PASSWORD` (capture stage forwards it to beats). Trade-off: super-admin chrome (all-orgs switcher, platform tabs) appears on camera — prefer buyer-demo when filming inside one org.
  - If a password ever stops working, re-set it (don't re-mint) via `PUT {SUPABASE_URL}/auth/v1/admin/users/<id>` `{"password":"…","email_confirm":true}` using the iicwt service-role key from `.env.local`.
- **Local DB = iicwt** (`.env.local` `VITE_SUPABASE_URL` + `SUPABASE_DB_URL`/service-role). Deployed dev reads a different DB — seed + capture LOCAL only.
- **Enrollment (Rule 40):** step-2 mints a PERSONAL code; bootstrap the learner PWA already-authed via the `ciq.lxp.enrollment` localStorage blob (skip the 3-step UI on camera).
- **Testing filter (Rule 56):** an `is_testing=true` learner is hidden from cohort analytics by default — set `ciq.experience.hideTesting.<scope>=false` if you need them visible.
- **VR-only learners don't hydrate `moduleScores`** → they won't appear in Mission Control's at-risk card. Don't promise "at-risk learner" on screen if the data can't show it; reframe the VO to what's real (e.g. "reviews waiting").
- **RLS title resolution:** org-library modules (`modules.course_id=NULL`) are invisible to the instructor JWT — even via a PostgREST embed (the embedded table's RLS applies). Instructor surfaces resolve titles via a **service-role endpoint** (auth + authorize via `user_has_course_access`, then service read; bind any object id to the authorized course to avoid IDOR) OR the **Rule-24 `module_snapshot`** frozen on the session (real fired modules have it; mock seeds must write it). The learner LXP resolves fine (service-role api). Mind **Rule 25** (scope results by `result.course_id` OR `modules.course_id`, never junction membership) and **Rule 38** (`module._uuid` is the UUID; `.id` is the display_id — key maps by `_uuid`).
- **Expo blank screen** = watchman/fmt dylib (Rule 47): `brew reinstall watchman folly`, restart.

## Capturing against PRODUCTION (2026-06 learner-code build)

Sometimes the real orgs/courses live on **prod**, not local dev (e.g. "Leadership Development Course" + "Command MRO" only exist on prod), and a beat genuinely needs the real prod domain (e.g. "strip `/lxp` from the URL → portal" only works same-origin on `commandiq.mothandflamevr.com`). When the user explicitly chooses prod:

- **Creds live in `.env.local.prod`** (NOT `.env.local` = dev/iicwt): `SUPABASE_URL`/`VITE_SUPABASE_URL` = prod ref `nkxbvimkxejkoecmujei`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL_PROD`, `COMMANDIQ_APP_URL=https://commandiq.mothandflamevr.com`. `psql` may be absent — use the Supabase REST + Auth Admin API via a node `.mjs` script. The ELEVENLABS key is wrapped in double-quotes — strip them.
- **Get explicit authorization for EVERY prod write** (Rich's rule). The auto-mode classifier hard-DENIES an Agent dispatch that bundles an unattended prod privilege-escalation write — do **read-only discovery first**, bring the user a precise ask, then do the single scoped write.
- **Provision your own throwaway instructor user** (the user will say "make your own user"): Auth Admin API `POST {SUPABASE_URL}/auth/v1/admin/users` `{email,password,email_confirm:true}` → trigger auto-creates `profiles` (set the `display_name` column so the portal header isn't the raw email). Grant access with **two `org_memberships` rows** (`org_role='instructor'`) → the org switcher needs membership count ≥ 2 (Rule 49).
- **Learner CREATION is org-admin-gated, NOT plain-instructor.** The only "Add Learner" entry is Org Admin → Learners → expand group (`OrgLearnersPanel.jsx`), reachable only when `auth.isOrgAdmin` (`org_memberships.org_role IN ('owner','admin')`) OR `is_super_admin`. To film it, set the throwaway user's `org_role='admin'` per org — the **narrowest** unlock that matches a real org admin and shows **no super-admin chrome** (prefer this over `is_super_admin=true`, which adds Pipeline tab / "Exit to Platform" / all-orgs switcher).
- **Org switcher may not render in the page chrome** for a 2-membership admin — preset `localStorage.commandiq_activeOrgId` before navigating so each video starts in the right org instead of filming a switch.
- **PII discipline is the hard gate on prod (real rosters = real names + emails):**
  - Type the demo learner's name into the roster **SEARCH box BEFORE expanding the group**, so the roster never renders other learners. (The Org Admin Learners tab **always shows testing rows** by design — `OrgLearnersPanel.jsx:660`; the hide-testing toggle only filters analytics, so prior demo dupes still appear, just "Testing"-badged. Search is what guarantees PII safety, not the toggle.)
  - **Landing dashboards leak names** — strategic "Commander's Readiness Overview" + "At-Risk Learners" lists a real name; **head-trim the beat to start at the Settings screen**, past the dashboard. Scan every frame for non-demo names before shipping.
- **Mark every learner you create `is_testing=true` AFTER capture** (authorized hygiene; Rule 56 hides them from analytics, Rule 23 forbids deleting them). Don't mark before the reveal shot — a testing learner you're filming must stay visible during the shot.
- **Reveal beats: the deliverable (a code/value) is at the END of a long navigation beat.** The 1.7× speed cap will TRIM THE TAIL and silently drop the reveal. Fix: lengthen that beat's VO so the footage plays in full, then **protect-hold** the reveal frame (footage at 1.0×, hold last frame for the VO remainder — never tail-trim a reveal). And **don't let the synthetic cursor rest ON the value** — it obscures a glyph (a held "BLACK-WOLF-7" read as "...1"); hold a frame where the cursor is adjacent and the full string is legible.
- **Synthetic browser address bar** (`${CLAUDE_PLUGIN_ROOT}/skills/video/tooling/lib/urlbar.js`) for any "edit/strip the URL" beat — `recordVideo` captures the page viewport, NOT real browser chrome. Fixed-position, injected via `addInitScript` on `documentElement`, per-character spans so a segment can be selected + animate-deleted; navigate the real page in sync. Run it in the authed context so `/` lands on the portal, not a login page.
- **Verify shared cross-beat values from PIXELS/DB, never an agent's self-report.** Capture agents misread their own captures (a minted code reported as `BLACK-WOLF-7` was misread `-1` by two readers; a stale B2 take typed `BLUE-FALCON-5`). For a code minted in beat N and entered in beat N+1, read it off the reveal frame AND confirm via service-role REST, then thread the confirmed string forward.
