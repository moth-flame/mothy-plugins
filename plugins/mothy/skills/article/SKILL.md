---
name: article
description: Produce a Zoho Desk Knowledge Base article from a product-demo flow — embed the demo VIDEO at the top, then a written step-by-step walkthrough with one screenshot per click/type action, so a reader gets the same step-by-step parity they'd get from watching the video. Use when the user says "/article", "make a KB article", "turn this demo into a help article", "write a knowledge base article", "publish a walkthrough to Zoho Desk", or asks to convert a captured demo flow into Zoho Desk documentation. Ideally consumes the per-step artifacts a `/video` run already captured. NOT for blog posts, in-app copy, slide decks, or publishing live (always a Draft).
---

# article — Zoho Desk KB article producer (from a demo flow)

> Sibling to `/video`. Where `/video` renders a narrated MP4, `/article` renders the SAME flow as a written Zoho Desk Knowledge Base article: the video embedded at the top, then a screenshot + instruction for EVERY step. Watch the video OR read the article — identical step-by-step guidance. Reuse the per-step screenshots a `/video` run captured; don't re-drive the app if they already exist.

## When to use / not use

USE for: turning a product-demo flow (ideally a completed `/video` capture) into one Zoho Desk KB article — video at top, written walkthrough with per-step screenshots below, created as a Draft for human review.
NOT for: a blog post, in-app tooltip/help copy, a slide deck, raw screenshots with no narrative, or anything that should publish live without review (this skill ALWAYS leaves the article in Draft).

If the user names a specific demo flow (e.g. the **CommandIQ / CommandMRO** flow) → the article documents the same beats the `/video` skill captured (see that skill's beat list / flow config). Confirm the flow + the Vimeo link before building.

## The deliverable + acceptance bar

One Zoho Desk KB article, **status = Draft**, under the flow's configured **root category** (`config.article.zoho.rootCategory`) in a sensible **section**, **permission = `config.article.zoho.permission` (ALL / everyone)**, with:
1. The demo **video embedded at the very top** (Vimeo player iframe), then
2. A written walkthrough where **every click or typing step has its own screenshot + its own instruction**, in order, so the article is step-for-step parity with the video.

The bar is **reader parity**: someone who only READS the article performs the exact same steps, in the same order, as someone who only WATCHES the video. No step in the video is missing a screenshot+instruction block in the article; no orphan screenshots without instructions. Clean semantic HTML, every per-step screenshot embedded inline as a base64 `data:` URI (no hot-links to the scratchpad), no raw IDs / debug / "preview/dummy/showcase" copy, no PII. **Return the Draft article URL** for human review — never publish.

## CONFIG (per-flow)

This skill is flow-agnostic. The Zoho destination + the source flow are read from the flow config file (`skills/video/tooling/flows/<flowId>.config.json`, validated by `flow.config.schema.json`). Read the **`article.*`** subtree of that config; never hard-code the destination in this SKILL.

| Config key | Meaning | CommandIQ example / default |
|---|---|---|
| `article.zoho.dc` | Zoho data center / domain — builds the API base URL (`https://desk.zoho.<dc>`) | `com` (US DC → base `https://desk.zoho.com`) |
| `article.zoho.orgId` | Zoho Desk org id — sent as the `orgId` header on every Desk call | `830065756` |
| `article.zoho.rootCategory` | EXISTING root KB category to publish under. Cannot create a root category (403) — reuse this one and create only **sections** under it | `Using CommandIQ` |
| `article.zoho.permission` | Article permission enum — the all/everyone value (available to ALL users, not just signed-in/agents) | `ALL` |
| `article.zoho.status` | Publish status — ALWAYS `Draft` for automated runs; never auto-publish | `Draft` |
| `seed.demoOrgAllowlist` | Org names the capture/article is permitted to be built from — the **publish-gate allowlist** (see below) | `["Vanguard Defense Group", "Vanguard Sustainment"]` |
| `title` | Human-facing flow title — seeds the article title | flow-specific |

The **source flow** is the matching `/video` run for this `flowId`: its per-step screenshots + step instructions are the article's raw material. If the config carries a Vimeo link / video id for the flow, use it for the embed; otherwise confirm the Vimeo link with the user (§0).

The CommandIQ values above are the documented example. Resolve every value from the loaded config at runtime — a different flow points the article at a different (still Draft) destination without editing this SKILL.

## Orchestration (orchestrator-only — same model as `/build`)

**This skill runs orchestrator-only, exactly like `/build` (see `/build` SKILL.md — orchestrator-only mode) and its sibling `/video`.** The main thread conducts; it does NOT itself perform any execution step. It keeps its context free for orchestration decisions and reviews the returned Draft.

**The main thread does ONLY these things (nothing else):**
- Plan the article + confirm scope with the user (flow/title, Vimeo link, target section, ordered step list).
- Read the flow config (`article.*` subtree) and run the **publish gate** (below) before any agent touches Zoho.
- Write the sub-agent briefs and dispatch them.
- Read sub-agent summary reports (NOT raw transcripts) and the returned Draft preview for the review.
- Make decisions: priority, dependency sequencing, merge, re-dispatch.
- Write the final user-facing summary (and return the Draft article URL for human review).

**The main thread does NOT itself perform ANY execution step.** EVERY one of these is dispatched to a focused background sub-agent — these were historically done in the main thread and MUST NOT be:
- Minting the Zoho access token from the refresh token / any OAuth or token exchange.
- Reading the KB category list (`GET /api/v1/kbRootCategories`) and choosing the configured root category + creating/choosing the section under it.
- Assembling the HTML answer with each per-step screenshot embedded as a base64 `data:` URI.
- Creating the Draft article (`POST /api/v1/articles`).
- Sourcing/slicing the per-step screenshots (driving the app / re-running a beat) when `/video` artifacts don't already cover them.

The whole Zoho pipeline (token → categories → HTML assembly with embedded images → draft create) runs inside ONE dispatched sub-agent (or per-article sub-agents when building several at once); the main thread only reviews the returned Draft. Dispatch independent articles in parallel in a single message; sequence dependent steps inside the agent's brief.

**The ONLY tool calls allowed directly in the main thread** (matching `/build` + `/video`): `TodoWrite`; `AskUserQuestion` when blocked; reading the flow config; running the publish-gate checklist; dispatching agents (writing the briefs); reading sub-agent reports; reading the returned Draft preview; and the final summary. Anything that touches Zoho, an OAuth token, an image, or a browser goes to a sub-agent.

**Dispatch discipline (per `/build` + the repo guidance):**
- **One agent per article** (or per stage when an article is large), with explicit file ownership + an explicit **"do not touch" list** so parallel agents don't collide.
- **Run in background and fan out independent articles in a single message** (separate messages serialize them). Sequence dependent steps within the agent's brief (categories before HTML assembly before article create).
- **Each agent reports its verdict before finishing** — the Draft article id + URL, the section it landed under, the embedded-image count, and confirmation it left `status=Draft`.
- **Review the agent's output before accepting** — read the returned Draft preview and judge reader parity (every click/type step has a screenshot + instruction; no orphan images; video embedded at top) before reporting to the user.
- **Secrets stay env-var-first and are never printed by agents.** Resolve Zoho creds env-var-first: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` (resolution order: env var → `$MOTHY_STATE_DIR` → `~/.mothy/.state/zoho-creds.json`; minted tokens cache at `~/.mothy/.state/zoho-tokens.json`). Brief every agent to read them from there and never echo a secret or token into a report, log, or committed file, and never commit `.state/` creds or the article images.

## 0. Plan + confirm scope first

- Identify the source flow + load its config; read the `article.*` subtree. **Preferred raw material:** a completed `/video` run for that `flowId` — its per-step screenshots + the step instructions are the article's material (the `/video` skill exports one PNG per click/type action; see "Sourcing screenshots" below). If no `/video` artifacts exist, gather the steps fresh (drive the app or have the user supply screenshots).
- Confirm with the user, before building: (a) the **Vimeo link** for the embed, (b) the **flow/title** and audience, (c) the **target section** under the configured root category (recommend one; create it if it doesn't exist), (d) the ordered step list (one block per click/type).
- Cheap to confirm, expensive to rebuild — lock the step list + Vimeo link + section BEFORE you start assembling images and creating the article.

## 1. The pipeline (stages)

```
plan/confirm → run PUBLISH GATE → gather per-step screenshots + instructions → confirm Vimeo embed link
            → read KB categories → choose configured root category → create/choose section under it
            → build HTML (video embed at top, then one block per step: screenshot + instruction)
            → embed each screenshot as a base64 data: URI → SANITIZE the HTML → create DRAFT article (permission=ALL)
            → return the Draft article URL for review
```

## 2. Sourcing the per-step screenshots + instructions

**Per-step parity is the whole point — every click/type step gets its own screenshot.** Two paths:

- **From a `/video` run (preferred).** The `/video` skill exports a per-step screenshot for each click/type action (the same synthetic-cursor frame just before/at the click), plus the matching written instruction (derived from the VO line or the beat's intent). Reuse those PNGs and instructions directly — same ordering, same flow. If the `/video` artifacts give you a continuous beat but not discrete per-step frames, slice per-step frames from the captured webm at each click timestamp, or re-run the beat capturing a screenshot at every interaction.
- **Fresh capture.** If there's no `/video` run, drive the real app (Playwright, headed or headless) and screenshot at EVERY click/type: name each shot `step-NN-<slug>.png` and write its one-line instruction ("Click **Course Builder** in the left nav.", "Type the learner's name into the **Search** box."). Imperative voice, bold the UI target, one action per step.

Discipline: instruction text must match the rendered screen (real data often differs from the brief). Spell out full feature/dimension names, not acronyms. Scrub PII from any screenshot before embedding (real rosters = real names — crop/blur or re-shoot against demo data). The publish gate (below) re-scans for PII as a hard checkpoint.

## 3. Zoho Desk KB API (verified this session)

**Data center / base URL.** Built from `config.article.zoho.dc`: base = `https://desk.zoho.<dc>`. CommandIQ is the US DC (`dc: "com"` → `https://desk.zoho.com`). EU/IN/AU/CN differ — read it from config, never assume.

**Org.** `config.article.zoho.orgId` (CommandIQ: `830065756`) — sent as the **`orgId`** request header on every Desk API call.

**OAuth.** A refresh token (long-lived) with scopes:
```
Desk.articles.ALL,Desk.settings.ALL,Desk.basic.READ,Desk.search.READ
```
- Creds resolve **env-var-first**: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` (order: env var → `$MOTHY_STATE_DIR` → `~/.mothy/.state/zoho-creds.json`); minted access tokens cache at `~/.mothy/.state/zoho-tokens.json`.
- **Mint an access token from the refresh token** before each session (access tokens expire ~1h):
  `POST https://accounts.zoho.com/oauth/v2/token` with `grant_type=refresh_token&client_id=…&client_secret=…&refresh_token=…` → `{ access_token }`.
- Send `Authorization: Zoho-oauthtoken <access_token>` + `orgId: <config orgId>` on every Desk call.
- **Security:** never echo the client secret / refresh token / access token into transcript, logs, or a committed file. The `.state/` dir is gitignored — keep it that way; do not commit creds, tokens, or downloaded article images.

**Endpoints.**
- **List categories** — `GET /api/v1/kbRootCategories` (root categories; drill into a category for its sections/child categories). Use this to find the configured **root category** and its sections.
- **Create a section (child category) ONLY** — `POST` to the categories endpoint with `name` + a `parentCategoryId` (a "section" is a child category under a root category). **You CANNOT create a root category — the token 403s on root-category create.** Reuse the configured root category (`config.article.zoho.rootCategory`, e.g. "Using CommandIQ") and create only the **section** under it.
- **Create an article** — `POST /api/v1/articles` with header `orgId` and JSON body:
  ```json
  {
    "categoryId": "<the SECTION id>",
    "title": "<article title>",
    "answer": "<HTML body with inline base64 data: image URIs>",
    "permission": "ALL",
    "status": "Draft"
  }
  ```
  - `categoryId` is the **section id** (the child category), not the root.
  - `permission` = `config.article.zoho.permission` — the **all/everyone** value so the article is available to ALL users (not just signed-in users or agents). Confirm the exact enum string against the live API response.
  - `status` = `"Draft"` (`config.article.zoho.status`) — never auto-publish.

**Image handling — embed base64 `data:` URIs inline (do NOT upload to Zoho).** The Zoho article image/attachment upload API **404s with this token** — do not call it. Instead, base64-encode each per-step PNG and embed it directly in the HTML answer:
```html
<img src="data:image/png;base64,iVBORw0KGgo…" alt="Step N — <description>"/>
```
Caveat: **some helpcenter themes strip `data:` URIs** when rendering. So **review the rendered Draft before publishing** to confirm the screenshots actually display; **fallback** if a theme strips them = paste the images via the Zoho web editor on the Draft. Never hot-link the scratchpad path — the article must render standalone from its own answer body.

**Always confirm the live shapes against a real response** (the `permission` enum, the exact section-create payload) — Zoho's editor + API have version quirks; read one real category list + one real article create response before hard-coding strings.

## 4. Build the HTML body (Zoho-editor-compatible)

Clean, semantic markup compatible with Zoho's KB editor:

- **Video embed FIRST**, at the very top of the body — a Vimeo player. Use the Vimeo `<iframe>` player embed:
  ```html
  <div class="kb-video">
    <iframe src="https://player.vimeo.com/video/<VIDEO_ID>"
            width="640" height="360" frameborder="0"
            allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
  </div>
  ```
  (Resolve the player URL via Vimeo oEmbed `https://vimeo.com/api/oembed.json?url=<vimeo-url>` if you only have the share link.) Put a short intro paragraph under the player ("Watch the walkthrough above, or follow the step-by-step instructions below.").
- **Then one block per step**, in order — each block = the step's screenshot (inline base64 `data:` URI) + its instruction:
  ```html
  <h3>Step N — <short title></h3>
  <p><img src="data:image/png;base64,<...>" alt="Step N — <description>"/></p>
  <p><instruction sentence, UI target in <strong></strong>></p>
  ```
- Use `<h2>`/`<h3>` for structure, `<ol>`/`<ul>` where a step has sub-points, `<strong>` for UI targets. No inline `style` soup, no `<script>`, no external CSS — Zoho strips/normalizes aggressively, and `<script>`/event handlers are forbidden by the publish-gate sanitize step. Keep it semantic so it survives the editor round-trip.
- Numbered steps must match the video's order exactly. The article ends with a short "What's next" / recap matching the video's close.

## Publish gate (MANDATORY before creating the Draft)

**This article is internet-public** (`permission = ALL`, Draft on a public helpcenter). The orchestrator MUST run this checklist and pass ALL three checks BEFORE any agent calls `POST /api/v1/articles`. Any failure is a HARD STOP — do not create the Draft; report the failure and ask the user.

1. **DEMO-ORG BINDING — HARD STOP.** Determine the **source org** of the capture (the org the `/video` run / screenshots were taken from). Assert it is a member of `config.seed.demoOrgAllowlist` (CommandIQ: `Vanguard Defense Group`, `Vanguard Sustainment`). If the capture's source org is NOT in the allowlist → **REFUSE to build the article** from it. Never publish a help article built from a non-demo / real-customer org. There is no override flag — fix the source, not the gate.

2. **PII / secret scan.** Scan EVERY instruction string AND every screenshot for real names, real emails, real unit/roster identifiers, tokens, or any secret, BEFORE the Draft is created. Demo data must be PII-safe (`config.seed.piiSafe`). Any real PII or secret found → HARD STOP: re-shoot against demo data or crop/blur the offending screenshot; do not proceed until clean. Screenshots are part of the scan — text-only scanning is insufficient.

3. **HTML SANITIZE the assembled answer.** Before POST, assert the answer body is safe:
   - Every `data:` URI is `image/*` ONLY (e.g. `data:image/png;base64,` / `data:image/jpeg;base64,`). Reject any non-image `data:` URI (no `data:text/html`, `data:application/*`, etc.).
   - Strip / reject any `<script>` tag.
   - Strip / reject any `on*` event-handler attribute (`onclick`, `onload`, `onerror`, …).
   - Strip / reject any `javascript:` URI in `href`/`src`.
   - Semantic HTML only. The `<iframe>` video embed is the **sole** permitted iframe; its `src` MUST start with the literal prefix `https://player.vimeo.com/` — reject any other iframe `src` (no other origin, no `http:`, no relative URL).
   Any violation → HARD STOP: sanitize the body and re-run this check until clean.

**Order (orchestrator runs this before `POST /api/v1/articles`):**
1. [ ] Source org ∈ `config.seed.demoOrgAllowlist` — else REFUSE.
2. [ ] PII/secret scan of all instructions + all screenshots — clean.
3. [ ] HTML sanitize: data: URIs image/* only; no `<script>`; no `on*`; no `javascript:`; semantic HTML only.
→ only if all three pass: create the Draft.

## 5. Create the Draft + return the URL

Dispatch this whole sequence to ONE sub-agent (per the Orchestration section) — the main thread does not run these steps itself; it runs the publish gate and reviews the agent's returned Draft. The agent's brief covers, in order:

1. Mint the access token from the refresh token (env-var-first creds).
2. `GET /api/v1/kbRootCategories` → find the configured **root category** (`config.article.zoho.rootCategory`; it MUST already exist — do not attempt to create a root category), then find/create the target **section** under it.
3. Assemble the HTML: video embed at top, then per-step blocks, each screenshot embedded as an inline base64 `data:image/...` URI (do NOT call the Zoho image-upload API — it 404s).
4. Confirm the publish gate passed (the orchestrator gates before dispatch; the agent re-asserts the HTML-sanitize check on its own assembled body as a last line of defense).
5. `POST /api/v1/articles` with `categoryId`=section id, `title`, `answer`=HTML, `permission`=`config.article.zoho.permission`, `status`=`"Draft"`, `orgId` header.
6. From the create response, build the **Draft article URL** (the agent/admin edit URL for the new article id) and report it back. **Do not publish** — the human reviews + publishes from Zoho.

The main thread then reads the agent's report + Draft preview, judges reader parity AND confirms the embedded screenshots actually render (theme may strip `data:` URIs — fallback is pasting via the Zoho web editor), and returns the Draft URL to the user.

## Dos and Don'ts

DO:
- Run orchestrator-only: the main thread plans, reads config, runs the publish gate, briefs, reviews the returned Draft, and decides — every Zoho/OAuth/HTML-assembly/draft-create step is a dispatched sub-agent.
- Read the Zoho destination from `config.article.zoho.*`; resolve creds env-var-first.
- Run the **publish gate** (demo-org binding, PII/secret scan, HTML sanitize) BEFORE creating the Draft — every time.
- Reuse the `/video` run's per-step screenshots + instructions when they exist — same flow, same order.
- Put the **video embed at the top**, then one screenshot + one instruction per click/type step. Reader parity is the bar.
- Read the live KB category list FIRST; place under the configured **root category**; create only a **section** under it (cannot create a root category — 403).
- Create the article as **Draft** with **all-users** permission. Embed every screenshot as an inline base64 `data:` URI; review the rendered Draft to confirm they display (theme may strip them → paste via the Zoho web editor).
- Scrub PII from screenshots before embedding. Spell out full feature names, not acronyms.
- Return the Draft article URL for human review.

DON'T:
- Don't run the Zoho pipeline (token mint / category reads / HTML assembly / draft create) from the main thread — dispatch it to a sub-agent and review the returned Draft.
- Don't auto-publish — always leave it as Draft.
- Don't build an article from an org NOT in `config.seed.demoOrgAllowlist` — HARD STOP.
- Don't call the Zoho image-upload API (404s with this token) — embed base64 `data:` URIs inline instead.
- Don't try to create a root category (403) — reuse the configured one and create only a section.
- Don't restrict the article to signed-in users / agents — permission is **all/everyone** per config.
- Don't skip a step's screenshot — every click/type step gets its own image + instruction (no orphan images, no instruction-only steps).
- Don't hot-link the scratchpad path in the HTML — the answer must render standalone from its own inline images.
- Don't echo or commit the client secret / refresh token / access token, and don't commit the article images or `.state/` creds (gitignored — keep it that way).
- Don't put raw UUIDs / debug / "preview/dummy/showcase" copy, PII, `<script>`, `on*` handlers, `javascript:` URIs, or non-image `data:` URIs into the article.
- Don't assume a data center — read `config.article.zoho.dc` (CommandIQ is US `com`).

## Quick reference

| Thing | Value |
|---|---|
| Base URL | `https://desk.zoho.<config dc>` (CommandIQ: US DC `https://desk.zoho.com`) |
| Org | `config.article.zoho.orgId` (CommandIQ: `830065756`) — `orgId` header |
| Root category | `config.article.zoho.rootCategory` (CommandIQ: `Using CommandIQ`) — reuse, never create (403) |
| OAuth scopes | `Desk.articles.ALL,Desk.settings.ALL,Desk.basic.READ,Desk.search.READ` |
| Token mint | `POST https://accounts.zoho.com/oauth/v2/token` (refresh_token grant) |
| Auth header | `Authorization: Zoho-oauthtoken <access_token>` |
| List categories | `GET /api/v1/kbRootCategories` |
| Create SECTION only | `POST` categories endpoint, `name` + `parentCategoryId` (root-category create 403s) |
| Create article | `POST /api/v1/articles` → `{categoryId(section), title, answer(HTML), permission(config), status:"Draft"}` |
| Images | Embed inline base64 `data:image/...` URIs (Zoho upload API 404s); review rendered Draft, fallback = paste via web editor |
| Video embed | Vimeo `<iframe>` player at top (oEmbed `https://vimeo.com/api/oembed.json` to resolve) |
| Publish gate | demo-org binding (allowlist) + PII/secret scan + HTML sanitize — MANDATORY before POST |
| Creds (env-var-first) | `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` / `ZOHO_REFRESH_TOKEN` → `$MOTHY_STATE_DIR` → `~/.mothy/.state/zoho-creds.json` (tokens cache `~/.mothy/.state/zoho-tokens.json`) |
