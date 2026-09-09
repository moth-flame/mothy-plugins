---
name: article
description: >-
  Produce a Zoho Desk Knowledge Base article from a product-demo flow. DEFAULT Path A
  for demo-flow articles is remote Agent37 via mothy MCP `article_make` (optional
  from_video_job / vimeo_id; poll render_status) — no local ZOHO_* credentials.
  Path B is hand-authored HTML via `zoho_kb_categories` then `zoho_kb_article_create`
  (Draft-only, server-side Zoho creds). Never use zoho_kb_search/zoho_kb_article for
  writes. Use when the user says "/article", "make a KB article", "turn this demo into
  a help article", "write a knowledge base article", "publish a walkthrough to Zoho
  Desk", or asks to convert a captured demo flow into Zoho Desk documentation. Always
  a Draft for human review — never auto-publish. NOT for blog posts, in-app copy, or
  slide decks.
---

# article — Zoho Desk KB article producer (from a demo flow)

> Sibling to `/video`. Where `/video` renders a narrated MP4, `/article` renders the SAME
> flow as a written Zoho Desk Knowledge Base article: the video embedded at the top, then
> a screenshot + instruction for EVERY step. **Default for demo flows:** remote
> `article_make` on Agent37 (parity with `/video` Path A) — no local Zoho / Vimeo /
> ElevenLabs keys. Prefer reusing a `/video` job via `from_video_job` / `vimeo_id` when
> available.

## When to use / not use

USE for: turning a product-demo flow (ideally a completed `/video` render) into one Zoho Desk KB article — video at top, written walkthrough with per-step screenshots below, created as a Draft for human review.
NOT for: a blog post, in-app tooltip/help copy, a slide deck, raw screenshots with no narrative, or anything that should publish live without review (this skill ALWAYS leaves the article in Draft).

If the user names a specific demo flow (e.g. the **CommandIQ / CommandMRO** flow) → confirm the flow + whether a recent `/video` `job_id` or Vimeo id exists before starting.

**Demo-seed writes are PRE-AUTHORIZED (same rule as `/video` Path B §8)** only if you fall through to local re-capture for missing screenshots. Prefer Path A so Agent37 owns capture.

## The deliverable + acceptance bar

One Zoho Desk KB article, **status = Draft**, under the flow's configured **root category** in a sensible **section**, with:
1. The demo **video embedded at the very top** (Vimeo player iframe), then
2. A written walkthrough where **every click or typing step has its own screenshot + its own instruction**, in order.

The bar is **reader parity**: someone who only READS the article performs the exact same steps as someone who only WATCHES the video. **Return the Draft article URL** for human review — never publish.

## Publishing paths — pick the first that applies

There are **two** user-facing ways this skill reaches Zoho. **Neither requires local `ZOHO_*` credentials.** Direct REST with local Zoho Self-Client creds is a specialist/Agent37-pipeline detail only — never the default, and never a reason to refuse Path A or Path B.

### Path A — remote `article_make` (DEFAULT for demo-flow articles)

Use this whenever the ask is "KB article for flow X" / parity with a `/video` demo. Secrets and capture live on Agent37:

1. Confirm the flow id (reuse the one from a recent `/video`, or call `mothy({action:"video_flows"})`).
2. Start — `mothy({action:"article_make", params:{flow, from_video_job?, vimeo_id?}})`:
   - Pass `from_video_job` when a `/video` Path A job id is available.
   - Pass `vimeo_id` when you already have the hosted video.
3. Poll `mothy({action:"render_status", params:{job_id}})` until `done` / `failed` (or wait for the Slack DM).
4. Hand the user the Draft editor link from the result. Always Draft — never auto-publish.

**Path A does NOT require** local `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` / `ZOHO_REFRESH_TOKEN`, ElevenLabs, Vimeo, ffmpeg, or Playwright. Missing those must **not** abort Path A. Do not call `agent37_exec` for the default path.

### Path B — hand-authored HTML via mothy MCP Zoho write actions

Use when the user is writing a help article that is **not** a demo-flow render (custom HTML body, no Agent37 capture), or when Path A is unavailable but the mothy connector still works:

1. `mothy({action:"zoho_kb_categories", params:{}})` → root categories and **section** ids.
2. Assemble clean semantic HTML (video embed + steps) in-session if you have the assets.
3. `mothy({action:"zoho_kb_article_create", params:{title, body_html, category_id, permission?}})`
   → Draft + editor link.

`status` is not a parameter — pinned to `Draft` server-side. Executable HTML (script tags, inline `on*=`, iframes other than the allowed Vimeo player pattern the server accepts, `javascript:` URLs) is **refused, not stripped**. A Draft has **no public help-center URL** (`public_url: null`).

**Never publish through `zoho_kb_search` / `zoho_kb_article`** — those are the READ half.

### Local Zoho REST — not a user path

Only the automated render pipeline / a machine that already carries `ZOHO_*` uses direct `POST /api/v1/articles`. Teammates on Claude Code / Cursor / Cowork use Path A or Path B. If Path A and Path B both fail, name the real blocker — do **not** tell the user they must obtain local `ZOHO_*` keys.

**If you cannot publish, say WHY — and the reason is almost never "no tool exists."**

| Symptom | Actual blocker | What to say |
|---|---|---|
| `article_make` / render fails | Agent37 or the flow is unhealthy | Quote the `render_status` error; offer Path B if they have HTML/screenshots |
| `zoho_not_configured` from an MCP Zoho action | mothy-mcp missing server-side `ZOHO_*` | Name it as a **server** config fix |
| No `mothy` connector | Connector missing | `/connect` — do not demand local Zoho keys |
| No source flow / no screenshots for Path B | No material | Say so; article can still be drafted from other sources without capture parity |

A Google Doc is a reasonable **fallback deliverable** when a Draft genuinely cannot be created — but only after Path A (and Path B when applicable) have been tried.

## CONFIG (per-flow)

Flow-agnostic destination metadata still lives in `skills/video/tooling/flows/<flowId>.config.json` (`article.*` subtree) for Path B HTML assembly and documentation. Path A reads the same flow id on Agent37 — do not hard-code Zoho org/category ids in chat when `article_make` owns the destination.

| Config key | Meaning | CommandIQ example / default |
|---|---|---|
| `article.zoho.dc` | Zoho data center / domain | `com` |
| `article.zoho.orgId` | Zoho Desk org id | `830065756` |
| `article.zoho.rootCategory` | EXISTING root KB category | `Using CommandIQ` |
| `article.zoho.permission` | ALL / everyone | `ALL` |
| `article.zoho.status` | ALWAYS `Draft` for automated runs | `Draft` |
| `seed.demoOrgAllowlist` | Demo orgs allowed as capture source | `["Vanguard Defense Group", "Vanguard Sustainment"]` |
| `title` | Human-facing flow title | flow-specific |

## Orchestration (orchestrator-only — same model as `/build`)

**This skill runs orchestrator-only, exactly like `/build` and its sibling `/video`.** The main thread conducts; it does NOT itself perform capture, HTML assembly, or Zoho REST.

**The main thread does ONLY these things:**
- Plan the article + confirm scope (flow/title, prefer `from_video_job` / `vimeo_id`).
- Choose Path A vs Path B (§ Publishing paths).
- For Path A: call `article_make` / poll `render_status` (or dispatch a single sub-agent that does), then summarize.
- For Path B: run the **publish gate** before create; dispatch HTML assembly + `zoho_kb_*` calls; review the Draft.
- Write the final user-facing summary (Draft URL).

**Prefer Path A so no agent ever handles a Zoho credential at all.** Path B also uses server-side Zoho via MCP — still no local `ZOHO_*`.

## 0. Plan + confirm scope first

- Identify the source flow. **Preferred:** a completed `/video` Path A `job_id` → pass as `from_video_job` to `article_make`.
- Confirm with the user: (a) flow id, (b) reuse of video job / Vimeo link, (c) audience / section if Path B.
- Cheap to confirm, expensive to rebuild.

## 1. The pipeline (stages)

**Path A (default):**
```
confirm flow (+ from_video_job / vimeo_id) → article_make → poll render_status → return Draft URL
```

**Path B (hand-authored):**
```
plan/confirm → PUBLISH GATE → gather screenshots + instructions → confirm Vimeo embed
            → zoho_kb_categories → build HTML → zoho_kb_article_create (Draft) → return editor URL
```

## 2. Sourcing the per-step screenshots + instructions

On **Path A**, Agent37 owns sourcing. On **Path B**:

- **From a `/video` run (preferred).** Reuse per-step PNGs + instructions when present.
- **Fresh capture.** Only if needed and Path A is unavailable — drive the app and screenshot every click/type.

Discipline: instruction text must match the rendered screen; scrub PII; publish gate re-scans.

## 3. Zoho Desk KB API notes (Path B / specialist reference)

Path B goes through MCP (`zoho_kb_*`) — you do not mint tokens locally. The REST shapes below are reference for HTML assembly and for understanding server behavior; **do not** tell end users to set `ZOHO_*` for Path A or Path B.

**Data center / base URL.** `https://desk.zoho.<dc>` from config (`com` → `https://desk.zoho.com`).

**Org.** `config.article.zoho.orgId` as `orgId` header on direct REST only.

**Image handling — embed base64 `data:` URIs inline** when assembling Path B HTML (Zoho image upload 404s with the Self-Client token). Review the rendered Draft; theme may strip `data:` URIs.

**Permission enum (2026-07-08):** `ALL` = public; registered-only input `REGISTERED_USERS` stores as `REGISTEREDUSERS`; verify the STORED form.

## 4. Build the HTML body (Path B — Zoho-editor-compatible)

Clean, semantic markup:

- **Video embed FIRST**, at the very top of the body — an INLINE Vimeo player that plays IN the article (not a click-to-open-new-tab thumbnail). Use the Vimeo `<iframe>` player embed:
  ```html
  <div class="kb-video">
    <iframe src="https://player.vimeo.com/video/<VIDEO_ID>?h=<HASH>"
            width="640" height="360" frameborder="0"
            allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
  </div>
  ```
  (Resolve the player URL via Vimeo oEmbed `https://vimeo.com/api/oembed.json?url=<vimeo-url>` if you only have the share link.) Put a short intro paragraph under the player ("Watch the walkthrough above, or follow the step-by-step instructions below.").

  **CRITICAL — the `?h=<HASH>` is MANDATORY for UNLISTED videos (2026-07-02 incident).** Every `/video` upload defaults to `config.deliver.vimeo.privacy.view=unlisted`, and an unlisted Vimeo video will NOT embed without its private hash in the player src — the iframe renders BLANK. The share link is `https://vimeo.com/<VIDEO_ID>/<HASH>`; the embed src is `https://player.vimeo.com/video/<VIDEO_ID>?h=<HASH>`. Get both from the Vimeo API `GET /videos/<id>` → `link` (has the hash) and `player_embed_url`. NEVER emit `player.vimeo.com/video/<id>` with no `?h=` for an unlisted video — that was the root cause of "the videos don't show." Also confirm the upload set `privacy.embed=public` (embeddable on any domain) — check via the API, not by assumption. (The `?h=` query keeps the src inside the publish gate's `https://player.vimeo.com/` prefix rule.)
  - Zoho bakes a `sandbox="allow-scripts allow-forms allow-same-origin allow-presentation ..."` onto the stored iframe. That sandbox INCLUDES `allow-scripts` + `allow-same-origin`, so a correctly-formed player (with the hash) DOES play inline inside Zoho — the sandbox is not the blocker; the missing hash was. Keep the `allow="autoplay; fullscreen; picture-in-picture"` attribute (Zoho may strip it, but basic click-to-play still works).
  - **VERIFY it actually renders (mandatory, per §5 step 7):** after create/update, re-fetch the stored body and confirm the iframe src contains `?h=`. Where possible, load the stored HTML in a headless browser and confirm the Vimeo `<iframe>` resolves (the player element loads, not a blank/error box). Do not trust that "an iframe is present" = "the video plays."
  - **Fallback ONLY if a given Zoho instance genuinely strips the iframe dead:** a clickable base64 data-URI poster (Vimeo thumbnail + play button) linking to `https://vimeo.com/<id>/<hash>`. This opens Vimeo in a new tab — it is the LAST resort, not the default, because it defeats inline playback. Prefer the inline iframe; only drop to the poster if you have PROVEN the inline player will not render in the target instance, and say so.
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

**Path A:** `article_make` + `render_status` — Agent37 creates the Draft. Main thread only confirms scope, starts the job, polls, and returns the editor URL.

**Path B:** collapses to `zoho_kb_categories` then `zoho_kb_article_create` (server-side Draft pin). Dispatch HTML assembly to a sub-agent when the body is large; main thread runs the publish gate and reviews the Draft.

**Specialist direct REST** (only when a machine already has `ZOHO_*` and MCP Path A/B are unavailable — not the teammate default):

1. Mint the access token from the refresh token (env-var-first creds).
2. `GET /api/v1/kbRootCategories` → find the configured **root category**, then find/create the target **section**.
3. Assemble the HTML: video embed at top, then per-step blocks with inline base64 `data:image/...` URIs.
4. Re-assert the HTML-sanitize check.
5. `POST /api/v1/articles` with `categoryId`, `title`, `answer`, `permission`, `status:"Draft"`.
6. Build the Draft editor URL from the create response.
7. **MANDATORY VERIFICATION** — `GET /api/v1/articles/{id}` and assert every `<img src>` starts with `data:image/`, the video iframe carries `?h=`, zero `[Screenshot:` / `[Video:` placeholders, image count matches steps. Fix and re-PATCH until clean.
8. Report Draft id + URL + section + `status=Draft`. **Do not publish.**

## Dos and Don'ts

DO:
- Prefer Path A (`article_make`) for demo-flow articles; pass `from_video_job` / `vimeo_id` when available.
- Prefer Path B (`zoho_kb_*`) for hand-authored HTML — still no local Zoho keys.
- Run the **publish gate** before Path B create.
- Put the **video embed at the top**, then one screenshot + instruction per click/type step.
- Always leave the article as **Draft**. Return the editor URL.
- Name the real blocker when publish fails — never "no tool exists."

DON'T:
- Don't require local `ZOHO_*` / ElevenLabs / Vimeo for Path A or Path B.
- Don't use `agent37_exec` as the default article path.
- Don't auto-publish.
- Don't build an article from an org NOT in `config.seed.demoOrgAllowlist` when sourcing from capture.
- Don't publish through `zoho_kb_search` / `zoho_kb_article` (read-only).
- Don't embed an unlisted Vimeo video without `?h=<HASH>` in the player src.
- Don't echo or commit Zoho tokens / `.state/` creds.

## Quick reference

| Thing | Value |
|---|---|
| Path A (default demo-flow) | `article_make` → poll `render_status` (optional `from_video_job` / `vimeo_id`) |
| Path B (hand-authored) | `zoho_kb_categories` → `zoho_kb_article_create` (Draft-only) |
| Local ZOHO_* | Not required for Path A or Path B |
| Root category (CommandIQ) | `Using CommandIQ` — reuse, never create (403) |
| Permission | `ALL` public default; registered-only input `REGISTERED_USERS` / stored `REGISTEREDUSERS` |
| Images (Path B HTML) | Inline base64 `data:image/...` URIs |
| Video embed | `player.vimeo.com/video/<id>?h=<HASH>` — `?h=` mandatory for unlisted |
| Publish gate | demo-org binding + PII scan + HTML sanitize — before Path B create |

