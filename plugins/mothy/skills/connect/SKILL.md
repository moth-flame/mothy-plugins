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
installed ships the **skills**; the **tools** come from a one-time connector
setup. Walk them through it **conversationally, one step at a time, plain
language**. Assume they are NOT technical. Wait for them to say "done" (or paste
a result) before moving to the next step. Never dump all steps at once unless
they ask.

Open with one friendly line, e.g.: *"Welcome! Mothy's skills are installed — we
just need to connect it once so the tools work. Takes about a minute. Ready?"*

## The steps

**Step 1 — Get your personal Mothy link.**
Open this in your browser:

  **https://mothy-mcp.vercel.app/connect**

Click **Sign in with Google** and choose your **@mothandflamevr.com** account.
The page comes back with a connector URL (it starts with
`https://mothy-mcp.vercel.app/mcp?token=…`). Click **Copy**.
→ Wait for them to confirm they've copied it.

**Step 2 — Add it as a connector in Claude.**
1. Top-left → **Customize**
2. Left sidebar → **Connectors**
3. Click the **+** → **Add custom connector**
4. **Name:** `Mothy`
5. **URL:** paste the link you copied
6. Click **Add / Connect**
→ Wait for them to confirm it's added.

**Step 3 — Allow the tools.**
The first time Mothy runs something, Claude asks permission. Choose
**Always allow** for the Mothy tools so it doesn't ask every time.

**Step 4 — Test it.**
Have them say: **"use mothy, run whoami"** — it should return their email.
When it does, they're fully set up.

Then tell them what they can do now (in their words, no jargon):
*"brief me on a customer"*, *"build a capability deck for <customer>"*,
*"edit this Google sheet/doc in place"*, and more. They don't have to name
skills — Mothy picks them up from plain requests.

## If something goes wrong

- **The /connect page says "you're almost there" / "not in the registry"** →
  their email isn't enabled for Mothy yet. Tell them to **message Rich or
  Chris** to get added, then come back and redo Step 1. Reassure them: nothing
  is broken on their end.
- **"Wrong Google account"** → they're signed into a personal Gmail in that
  browser. Use the **"sign out and try again"** link on the page, then pick the
  **@mothandflamevr.com** account.
- **Connector shows an error or won't connect** → re-copy a **fresh** URL from
  `https://mothy-mcp.vercel.app/connect` (the link can be regenerated anytime)
  and re-add it.
- **They see an old greyed-out "mothy — not connected" connector** → that's a
  leftover; they can ignore or remove it. The one they just added (named
  `Mothy`, from the copied URL) is the live one.

## Do NOT

- Don't have them paste a token into a JSON file or edit any config by hand —
  the only step is paste-the-URL-into-the-connector.
- Don't use "MCP" jargon — call it "the Mothy connector."
- Don't tell them to use the browser "Authenticate on install" flow — that
  OAuth path does not complete in the desktop app today; the custom-connector
  steps above are the supported path.
