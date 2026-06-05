# Mothy Marketplace

Private Claude Code / Cowork plugin marketplace for **Moth+Flame**.

This marketplace ships a single plugin — **`mothy`** — that connects your
Claude session to the Moth+Flame team agent: customer briefs, capability
decks, cross-source intel search, in-place Google Workspace edits, and
teammate onboarding.

## Add the marketplace

```
/plugin marketplace add moth-flame/mothy-plugins
```

Then install the plugin:

```
/plugin install mothy@mothy-marketplace
```

On install you'll be prompted to sign in with your **@mothandflamevr.com**
Google account (OAuth). That's how Mothy knows who you are and what you're
allowed to see.

## Access

This is a **private, org-only** marketplace. It is intended for Moth+Flame
team members. Access to Mothy's data and actions is gated on a valid
`@mothandflamevr.com` Google sign-in — installing the plugin without a
Moth+Flame account will not grant access to team data.

## What's inside

| Plugin  | What it does |
|---------|--------------|
| `mothy` | Moth+Flame team agent — briefs, decks, intel, Google Workspace edits, onboarding. See [`plugins/mothy/README.md`](plugins/mothy/README.md). |
