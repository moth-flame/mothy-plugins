# Mothy Marketplace

Private Claude Code / Cowork plugin marketplace for **Moth+Flame**.

This marketplace ships a single plugin — **`mothy`** — bundling the Moth+Flame
team agent's **skills + slash commands**: customer briefs, capability decks,
cross-source intel, in-place Google Workspace edits, demo videos, KB articles,
and teammate onboarding.

## 1. Add the marketplace + install the plugin

```
/plugin marketplace add moth-flame/mothy-plugins
/plugin install mothy@mothy-marketplace
```

This installs **skills + commands only — no connector.** (Intentional — see
"Why skills-only" below.)

## 2. Connect the Mothy connector (one-time — gives the skills their tools)

Mothy is an **org connector** — it's already in everyone's connector list. No
token to mint, nothing to paste. **Easiest: just say "walk me through getting
set up" (or `/connect`)** and Mothy guides you. The steps:

- **Desktop app (Chat / Cowork / Code):**
  1. **Customize → Connectors** → find **Mothy** → **Connect**.
  2. **Sign in with Google** (`@mothandflamevr.com`).
  3. On Mothy's connector page, set **Tool permissions** → **Always allow**.
- **Terminal Claude Code CLI:** `/mcp` → select `mothy` → **Authenticate**
  (browser OAuth; works because the loopback is local).

Then test: *"use mothy, run whoami"* → returns your email.

*Fallback only — if the org connector isn't in your list:* generate a per-user
URL at **https://mothy-mcp.vercel.app/connect** (Sign in with Google → Copy) and
**Customize → Connectors → Add custom connector** → paste → name it `Mothy`.

## Why skills-only (no bundled connector)

The plugin ships **skills + commands only** — it does NOT bundle an MCP
connector. Mothy is published as an **org connector** that appears in the
connector list ready to **Connect**; bundling one in the plugin would only
create a dead, duplicate placeholder. The org connector is provisioned
separately from the plugin.

## Access

Private, **org-only** marketplace for Moth+Flame. Mothy's data + actions are
gated on a valid `@mothandflamevr.com` identity (your `/connect` sign-in or an
admin-minted token). Not in the registry yet? Message **Rich or Chris**.

## What's inside

| Plugin  | What it does |
|---------|--------------|
| `mothy` | Moth+Flame team agent skills + commands — briefs, decks, intel, Google Workspace edits, demo videos (`/video`), KB articles (`/article`), video pipeline setup (`/video-setup`), onboarding. See [`plugins/mothy/README.md`](plugins/mothy/README.md). |
