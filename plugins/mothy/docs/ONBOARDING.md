# Onboarding — your first demo doc (video → article)

Welcome. This is the **happy path** for a new teammate: from a clean machine to a
published CommandIQ Knowledge Base article, the way the rest of us do it. Follow
it top to bottom the first time. Once you've done it once, the
[pre-run checklist](#pre-run-checklist-the-9-hard-won-gotchas) at the bottom is
all you'll need to reread.

The two skills you'll use — **`/video`** and **`/article`** — are Claude Code
skills (they live under `~/.claude/skills/video/` and `~/.claude/skills/article/`,
installed with your Claude Code setup). They are flow-agnostic engines: `/video`
drives the real running app and renders a narrated MP4; `/article` turns that
same flow into a Zoho Desk KB article. The Mothy **plugin** (this repo) ships the
team skills + the connector you'll lean on for Slack, Google Sheets, and account
data.

> **The `make_demo_doc` chain (video then article) is an optional convenience.**
> Each skill stands on its own — you can run `/video` and stop, or run `/article`
> against an existing Vimeo link. Chaining them just means the article reuses the
> per-step screenshots the video run already captured, so you don't re-drive the
> app. Use the chain when you want both assets from one flow; skip it when you
> only need one.

---

## 1. Install the Mothy plugin

In Claude Code:

```
/plugin marketplace add moth-flame/mothy-plugins
/plugin install mothy@mothy-marketplace
```

This installs **skills + slash commands only** — no connector yet. Then connect
Mothy (one-time). The easiest path is to just ask:

> **"walk me through getting set up"**  (or run **`/connect`**)

Mothy runs its `connect` skill and walks you through it step-by-step. The short
version — Mothy is an **org connector**, already in everyone's connector list, so
there's no token to mint:

- **Desktop (Chat / Cowork / Code):** Customize → Connectors → **Mothy** →
  **Connect** → sign in with Google (`@mothandflamevr.com`). On Mothy's connector
  page, set Tool permissions (top-right dropdown) to **Always allow**.
- **Terminal Claude Code CLI:** `/mcp` → `mothy` → **Authenticate** (browser
  OAuth).

Test it: *"use mothy, run whoami"* → it returns your email. If Mothy isn't in
your connector list yet, message **Rich or Chris** to get added. (Full detail:
the plugin [README](../README.md).)

Why this matters for demo docs: `/video` posts to Slack `#product_and_customer_success`
and appends to the Demo Videos sheet via the Mothy connector — no local Slack or
Google secret. If the connector test above passes, those steps work.

---

## 2. Place your credentials, then set up `/video`

The demo skills need a handful of API credentials. **Credential resolution is
env-var-first**, in this order:

1. an **environment variable** (preferred), else
2. the directory named by **`$MOTHY_STATE_DIR`**, else
3. **`~/.mothy/.state/<file>.json`**.

The canonical, always-current credential reference is **[CREDENTIALS.md](./CREDENTIALS.md)**
(sibling of this file) — read it for the exact variable names, scopes, and where
to get each key. The essentials you'll touch for a video → article run:

| Credential | Env var | Fallback file | Notes |
|---|---|---|---|
| ElevenLabs (voiceover) | `ELEVENLABS_API_KEY` | `.env.local` | **Strip surrounding double-quotes** — the saved key is wrapped in `"`. |
| Vimeo (publish) | `VIMEO_ACCESS_TOKEN` | `~/.mothy/.state/vimeo-creds.json` | Needs a **paid Vimeo plan + `upload` scope** (and `edit` to set metadata). |
| Zoho Desk (article) | `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` | `~/.mothy/.state/zoho-creds.json` (tokens cache `zoho-tokens.json`) | Self-Client; scopes `Desk.articles.ALL,Desk.settings.ALL,Desk.basic.READ,Desk.search.READ`. |
| Demo capture login | `COMMANDIQ_DEMO_CAPTURE_PASSWORD` | — | Never write the literal password into any file — read it from the env at runtime. |

Slack and Google Sheets are **brokered through the Mothy connector** (step 1) —
there is no local secret for them.

**Set up `/video`.** With the credentials placed, do a one-time setup pass so the
skill knows your environment is wired:

- Confirm `ELEVENLABS_API_KEY` resolves (env var or `.env.local`, quotes
  stripped) — this is what blocks most first runs.
- Confirm `VIMEO_ACCESS_TOKEN` resolves and is on a paid plan with `upload`
  scope. If you're not publishing to Vimeo yet, that's fine — the run will still
  Slack-DM you the local MP4 path and tell you Vimeo needs a paid token.
- Confirm the Mothy connector test from step 1 passed (Slack post + sheet append
  depend on it).

> Secrets stay **gitignored and never printed**. Keep tokens in `.env.local` or
> the documented `~/.mothy/.state/*.json` files; never commit them, never echo
> them into a report or log.

---

## 3. Confirm the demo login works

The demo flows drive the real CommandIQ app — no CommandIQ repo access needed.
Before you record anything, confirm you can log in:

- **URL:** `https://dev-commandiq.mothandflamevr.com`
- **User:** `demo-capture+vanguard@mothandflame.test`
- **Password:** from the `COMMANDIQ_DEMO_CAPTURE_PASSWORD` env var at runtime
  (never typed into a file).

Two demo orgs, each maps to a flow:

- **Vanguard Defense Group** → the **strategic** flow (leadership / readiness).
- **Vanguard Sustainment** → the **technical** flow (CommandMRO / maintenance).

The demo data is anonymized and PII-safe by design — but on production rosters PII
discipline is still the hard gate (see the checklist). Log in, confirm the org
switcher shows both Vanguard orgs, and confirm a course/dashboard renders with
real data. If the splash ("Loading assessment frameworks…") never clears, that's
an environment issue — sort it before recording.

---

## 4. Run `/video` on a flow + confirm scope

In Claude Code, invoke the skill:

```
/video make a demo video of the CommandMRO maintenance flow
```

What to expect — and what you confirm:

1. **The skill plans the beats and confirms scope with you FIRST.** It leads with
   a recommendation (for the technical flow: *C-130 Maintenance Foundations* →
   *External Power System / Ground Power Cart Output Basics*). **Cheap to confirm,
   expensive to re-capture** — lock the course + module(s), beat list + order,
   narration voice, and target runtime before any capture happens.
2. It **spikes one beat end-to-end** (servers up, login works, screen renders with
   real data, ElevenLabs returns audio, one capture records) — a go/no-go before
   building all the beats.
3. It captures each beat, renders voiceover, assembles the MP4, then does a
   **live-render review** (reads the rendered frames; not just an ffprobe pass)
   and re-captures anything broken.
4. On pass, it **delivers three ways**: Slack-DMs you the final MP4 path, uploads
   to **Vimeo (unlisted, embeddable)**, posts the Vimeo link to
   `#product_and_customer_success`, and logs a row in the **Demo Videos** tab of
   the videos workbook.

Confirm the deliverable yourself: open the MP4 (or the Vimeo link), check it's the
right flow, the narration matches the screen, and there's **no loading splash and
no Playwright glitches** (stray focus rings, half-loaded cards, stuck hover). If
something's off, tell the skill which beat — it re-captures.

---

## 5. Run `/article` → review the Zoho Draft → publish yourself

Now turn the same flow into a Knowledge Base article. Invoke:

```
/article turn that CommandMRO demo into a Zoho KB article
```

What to expect:

1. It **confirms scope** — the **Vimeo link** for the embed, the title/audience,
   and the target **section** under the **CommandIQ** category (it recommends one,
   creates it if absent).
2. It **reuses the per-step screenshots** your `/video` run captured (same flow,
   same order — it doesn't re-drive the app) and builds the HTML: **video embedded
   at the top**, then one screenshot + one instruction per click/type step. The
   bar is **reader parity** — someone who only reads the article performs the exact
   same steps as someone who only watches the video.
3. It uploads each image to Zoho and **creates the article as a Draft**
   (`permission = all/everyone`, `status = Draft`) under the CommandIQ section, then
   **returns the Draft article URL**.

**Review, then publish — that last step is yours.** The skill **always leaves the
article in Draft and never publishes.** Open the returned Draft URL in Zoho Desk,
read it for parity (every step has a screenshot + instruction, no orphan images,
video plays at top, no raw IDs / PII / placeholder copy), fix anything in the Zoho
editor, then **publish it yourself**. That human review-and-publish gate is
deliberate.

---

## Pre-run checklist — the 9 hard-won gotchas

Read this before every `/video` run. Each line cost someone a re-capture or a
broken cut to learn. (Source: the `/video` skill's "Environment gotchas" +
"Capturing against PRODUCTION" sections, plus the splash rule in §3.)

1. **`npm run dev` does NOT serve `/api/*`.** It's Vite-only. And `vercel dev` is
   unusable here (`vercel.json` > 128 builds → hard error). Stand up the tiny Node
   shim (`scripts/demo/.state/api-server.mjs`) that mounts the real `api/*.js`
   handlers on `:3001`; the Expo LXP proxies `/api/*` → `:3001`.

2. **Never leave the CommandIQ loading splash in a cut.** The "Loading assessment
   frameworks…" splash shows on boot *and* on some in-app navigations. Every beat
   that boots or navigates must **poll for a known post-splash element** (the dark
   Mission Control header, a chip, a course card) before recording; the assembler
   also auto-trims any that slip through. A splash frame in a thumbnail = the beat
   failed — re-capture.

3. **Capture LOCAL only.** The local DB is **iicwt** (`.env.local`
   `VITE_SUPABASE_URL` + service-role). Deployed dev reads a *different* DB — seed
   and capture against local, not the deployed URL, or your data won't match.

4. **Use a FIXED, deterministic enrollment code** — never a random one. A random
   code re-mints between beats and breaks on-screen continuity (the same learner
   must read identically across a pre-state and a post-state beat). Use a
   human-friendly alphabet (no `0/O/1/I/L/5/S`).

5. **The ElevenLabs key in `.env.local` is wrapped in double-quotes — strip
   them** before use, or the TTS call 401s.

6. **Vimeo upload needs a paid plan + `upload`-scoped token.** A free account or a
   token missing the scope 401/403s on `POST /me/videos`. If it can't run, the
   skill still Slack-DMs you the local path and tells you Vimeo needs a paid token
   — don't treat that as a failed run.

7. **PII is the hard gate on production** (real rosters = real names + emails).
   Type the demo learner's name into the roster **search box BEFORE expanding the
   group** so other learners never render. **Head-trim** any landing dashboard
   (the strategic "Commander's Readiness Overview" / "At-Risk Learners" lists a
   real name) so the beat starts past it. Scan **every frame** for non-demo names
   before shipping.

8. **Get explicit per-write authorization for EVERY production write** (Rich's
   rule). Do **read-only discovery first**, bring a precise ask, then do the single
   scoped write. Never bundle an unattended prod privilege-escalation write into an
   agent dispatch — the classifier hard-denies it. And **never change RLS / grant
   privileges to make a capture work** — fix via an authorized service-role path or
   realistic seed data, or escalate.

9. **Verify shared cross-beat values from PIXELS or the DB — never an agent's
   self-report.** For a code minted in beat N and entered in beat N+1, read it off
   the reveal frame **and** confirm via service-role REST, then thread the
   confirmed string forward. (Capture agents have misread their own captures — a
   minted `BLACK-WOLF-7` was read `…-1` by two readers.) And don't let the
   synthetic cursor rest *on* the value in a reveal shot — hold a frame where the
   full string is legible.

---

### Where to go deeper

- Full `/video` engine, pipeline, and prod-capture playbook: `~/.claude/skills/video/SKILL.md`.
- Full `/article` Zoho pipeline and HTML contract: `~/.claude/skills/article/SKILL.md`.
- Credentials reference: [CREDENTIALS.md](./CREDENTIALS.md).
- Connecting Mothy / the connector: the plugin [README](../README.md).
