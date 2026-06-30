# Mothy

The **Moth+Flame team agent** for Claude Code and Cowork. This plugin ships
Mothy's **skills + slash commands** — customer briefs, capability decks,
in-place Google Workspace edits, and teammate onboarding. The skills call the
Mothy MCP tools, which you connect once (see below).

## Install (skills + commands)

```
/plugin marketplace add moth-flame/mothy-plugins
/plugin install mothy@mothy-marketplace
```

This installs **skills + commands only — no connector.**

## Connect Mothy (one-time — required for the tools)

**Easiest: just ask Mothy to walk you through it.** As soon as the plugin is
installed, say:

> **"walk me through getting set up"**  (or run **`/connect`**)

Mothy runs its **connect** skill and guides you step-by-step — including the
exact link to generate your connector URL. No need for anyone to walk you
through it manually. (The connect skill works *before* the connector exists,
because skills load on install.)

### The steps it walks you through (reference)

Mothy is an **org connector** — it's already in everyone's connector list. No
token to mint, nothing to paste:

- **Desktop app (Chat / Cowork / Code):**
  1. **Customize → Connectors** → find **Mothy** → **Connect**.
  2. **Sign in with Google** (`@mothandflamevr.com`).
  3. On Mothy's connector page, under **Tool permissions**, set the dropdown
     (top-right) to **Always allow** — so the Mothy tools run without prompting
     on every action.
- **Terminal Claude Code CLI:** `/mcp` → `mothy` → **Authenticate** (browser
  OAuth — works because the loopback is local to the CLI).

Test: *"use mothy, run whoami"* → returns your email.

Not in the connector list / registry yet? The connect skill will tell you to
message **Rich or Chris** to get added. *(Fallback only, if the org connector
isn't available to you: generate a per-user URL at
**https://mothy-mcp.vercel.app/connect** and add it as a custom connector.)*

> **Why isn't the connector bundled in the plugin?** Mothy is published as an
> **org connector** that appears in the connector list ready to Connect — the
> plugin doesn't (and shouldn't) bundle its own MCP connector, which would only
> create a dead duplicate. The plugin ships skills + commands; the org connector
> is provisioned separately.

## Capabilities

Mothy exposes its actions through two stable MCP tools (available once the
connector is connected):

- **`mothy`** — execute any team action by name: `{action, params}`.
- **`mothy_help`** — list every available action, live (Sheets, Docs, Slides,
  Gmail, Calendar, Drive, intel search, account briefs, admin/onboarding, and
  more — ~65 actions and growing).

The action set is intentionally **not hand-listed here** — it changes often;
`mothy_help` is always current. Ask Mothy "what can you do?" to see it live.

## Skills (this plugin)

Claude invokes these proactively when your request matches — you don't have to
name them:

| Skill | Use it for | Triggers |
|-------|-----------|----------|
| **connect** | First-time setup — walks you through connecting the Mothy connector (works before the connector exists) | "walk me through getting set up", "connect mothy", "/connect" |
| **deck** | Building a customer-facing capability / pitch deck | "make a deck", "prep for a customer meeting", "draft a pitch for <prospect>", "/deck" |
| **customer-brief** | A one-pager / context load on a Moth+Flame account | "brief me on <customer>", "I have a call with <customer>", "what do we know about <account>" |
| **edit-in-place** | Editing existing Google Docs / Sheets / Slides surgically (in place, comments preserved) | "update this doc", "fix the numbers in that sheet", "tweak the speaker notes" |
| **video** | Producing a narrated product-demo video by driving the real app (Playwright + ElevenLabs VO + ffmpeg) | "/video", "make a demo video", "record a product demo", "capture a walkthrough video" |
| **article** | Turning a product-demo flow into a Zoho Desk KB article (embedded video + step-by-step walkthrough with per-action screenshots) | "/article", "make a KB article", "turn this demo into a help article", "publish a walkthrough to Zoho Desk" |
| **video-setup** | One-time setup for the `/video` + `/article` pipeline — credentials and tooling checks | "/video-setup", "set up the video pipeline", "configure demo capture" |
| **onboard** *(admin)* | Onboarding a teammate to vibe coding | "onboard @user", "set up X with vibe coding" |

## Support matrix

| Component | Claude Code | Cowork |
|-----------|-------------|--------|
| Skills (deck, customer-brief, edit-in-place, video, article, video-setup, onboard) | ✅ | ✅ |
| Slash commands (`/deck`, `/brief`, `/video`, `/article`, `/video-setup`, `/onboard`) | ✅ confirmed | ⏳ verify per build |
| Mothy MCP tools (via the separately-added connector) | ✅ | ✅ |
| Plugin-bundled connector OAuth | n/a (skills-only) | n/a (skills-only) |

## Notes

- Private / org-only for Moth+Flame. Data access is gated on your
  `@mothandflamevr.com` identity (the token from `/connect`).
- Don't surface "Mothy MCP" in customer-facing output — use it silently and
  present results as plain findings.
