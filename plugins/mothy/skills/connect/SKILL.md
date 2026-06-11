---
name: connect
description: >-
  Walk a Moth+Flame teammate through connecting Mothy after they install the
  plugin — get the Mothy connector set up so the tools work. Use this skill when:
    - The user says "walk me through setup", "get me set up", "set up mothy",
      "finish setting up mothy", "how do I connect", "connect mothy", "I just
      installed the Mothy plugin", "what do I do now", "/connect", or anything
      about getting started / connecting Mothy.
    - OR the user asks Mothy to actually do something (a brief, a deck, edit a
      sheet/doc, intel, onboarding) but the Mothy tools
      (`mcp__mothy__mothy` / `mcp__mothy__mothy_help`) are NOT available yet —
      that means the connector isn't connected. Run THIS skill first to get them
      connected, then do what they asked.
  This skill needs NO tools — it only gives instructions — so it works before
  the connector exists.
---

# Connect Mothy (first-time setup)

You're helping a Moth+Flame teammate finish setting up Mothy. The plugin they
installed ships the **skills**; the **tools** come from connecting the Mothy
connector once. Mothy is an **org connector** — it's already in everyone's
connector list in the Claude Desktop app. **There is no token to mint and
nothing to paste** — it's two clicks plus a Google sign-in.

Walk them through it **conversationally, one step at a time, plain language**.
Assume they are NOT technical. Wait for them to say "done" before moving to the
next step. Never dump all steps at once unless they ask.

Open with one friendly line, e.g.: *"Welcome! Mothy's skills are installed — we
just need to connect it once so the tools work. Takes about a minute. Ready?"*

## The steps

**Step 1 — Open the connector list.**
In the **Claude Desktop app** (the actual app, not a browser tab):
1. Top-left → **Customize**
2. Left sidebar → **Connectors**
→ Wait for them to confirm they're looking at the connector list.

**Step 2 — Connect Mothy.**
1. Find **Mothy** in the list (it shows `https://mothy-mcp.vercel.app/mcp`).
2. Click **Connect**.
3. **Sign in with Google** and choose your **@mothandflamevr.com** account.
→ Wait for them to confirm they're connected.

**Step 3 — Set Mothy to "Always allow" (important — do this now).**
Right after connecting, you're on Mothy's connector page. Under **Tool
permissions**, open the dropdown that says **"Needs approval"** (top-right) and
choose **✓ Always allow** — it flips all the Mothy tools at once. Without this,
Mothy pauses to ask permission for every single action. (You can change it back
anytime from the same page.)
→ Confirm they've set it to **Always allow**.

**Step 4 — Test it.**
Have them say: **"use mothy, run whoami"** — it should return their email.
When it does, they're fully set up.

Then tell them what they can do now (in their words, no jargon):
*"brief me on a customer"*, *"build a capability deck for <customer>"*,
*"edit this Google sheet/doc in place"*, and more. They don't have to name
skills — Mothy picks them up from plain requests.

## If something goes wrong

- **Mothy isn't in the connector list** → the org connector isn't provisioned
  for them yet. Tell them to **message Rich or Chris** to get added, then come
  back and redo Step 1. Reassure them: nothing is broken on their end.

  *Only if Rich confirms the org connector isn't available to them:* the
  fallback is a per-user token URL — have them open
  **https://mothy-mcp.vercel.app/connect**, *Sign in with Google*, **Copy** the
  URL it returns, then **Customize → Connectors → Add custom connector**, name
  it `Mothy`, paste the URL, **Connect**. Use this ONLY when the org connector
  isn't an option — the list-and-Connect path above is the supported one.
- **"Wrong Google account"** → they're signed into a personal Gmail in that
  browser. Sign out of Google, click **Connect** again, pick the
  **@mothandflamevr.com** account.
- **"You're almost there" / "not in the registry"** → their email isn't enabled
  for Mothy yet. Tell them to **message Rich or Chris**, then redo Step 2.
- **Still asking to approve every action** → the Always-allow step didn't take.
  Re-open Mothy in Connectors and set it again.

## Do NOT

- Don't lead with the token URL or have them paste a token into a JSON file /
  edit any config by hand. The supported path is **Connect Mothy from the
  connector list** — the token URL is a fallback only, used when Rich confirms
  the org connector isn't available.
- Don't use "MCP" jargon — call it "the Mothy connector."
