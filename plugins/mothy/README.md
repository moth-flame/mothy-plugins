# Mothy

The **Moth+Flame team agent** for Claude Code and Cowork. Mothy gives your
Claude session direct, authenticated access to Moth+Flame's tooling:
customer briefs, capability decks, cross-source intel, in-place Google
Workspace edits, and teammate onboarding.

## Install

Add the marketplace and install:

```
/plugin marketplace add moth-flame/mothy-plugins
/plugin install mothy@mothy-marketplace
```

### Sign in on install

When the plugin connects, you'll be sent through a Google OAuth sign-in.
**Use your `@mothandflamevr.com` account** — Mothy identifies you and scopes
what you can see by that sign-in. Non–Moth+Flame accounts are rejected.

There's nothing to paste, no token to copy, no config to edit. The plugin
ships a remote MCP connection (`https://mothy-mcp.vercel.app/mcp`) and the
sign-in happens in the browser.

> **Fallback (cloud / headless CC):** environments that can't run the
> interactive browser OAuth flow can connect with a per-user token URL
> (`https://mothy-mcp.vercel.app/mcp?token=oct_…`) instead. Ask Rich to mint
> one. This is only for headless/cloud sessions — normal desktop installs
> use the browser sign-in above.

## Capabilities

Mothy exposes its actions through two stable MCP tools. **These are the
entry points — start here:**

- **`mothy`** — execute any team action by name: `{action, params}`.
- **`mothy_help`** — list every available action, live. Call this to
  discover what Mothy can do right now (Sheets, Docs, Slides, Gmail,
  Calendar, Drive, intel search, account briefs, admin/onboarding, and
  more — roughly 65 actions and growing).

The action set is intentionally **not hand-listed here** — it changes
often, and `mothy_help` is always current. Ask Mothy "what can you do?" or
call `mothy_help` to see the live catalog.

### v1 Skills

The plugin ships four skills that Claude invokes proactively when your
request matches — you don't have to name them:

| Skill | Use it for | Triggers |
|-------|-----------|----------|
| **deck** | Building a customer-facing capability / pitch deck | "make a deck", "prep for a customer meeting", "draft a pitch for <prospect>", "/deck" |
| **customer-brief** | A one-pager / context load on a Moth+Flame account | "brief me on <customer>", "I have a call with <customer>", "what do we know about <account>" |
| **edit-in-place** | Editing existing Google Docs / Sheets / Slides surgically (in place, comments preserved) | "update this doc", "fix the numbers in that sheet", "tweak the speaker notes" |
| **onboard** *(admin)* | Onboarding a teammate to vibe coding | "onboard @user", "set up X with vibe coding" |

## Support matrix

Where each surface of the plugin works today:

| Surface | Claude Code | Cowork |
|---------|-------------|--------|
| Skills (deck, customer-brief, edit-in-place, onboard) | ✅ | ✅ |
| Remote MCP (`mothy` / `mothy_help`) | ✅ | ✅ |
| Slash commands | ✅ confirmed | ⏳ TBD |
| Hooks | ✅ Code-only | — |
| Agents | ✅ Code-only | — |

## Notes

- This plugin is **private / org-only** for Moth+Flame.
- All data access is gated on your `@mothandflamevr.com` Google sign-in.
- Don't surface "Mothy MCP" in customer-facing output — use it silently and
  present results as plain findings.
