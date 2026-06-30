---
name: video-setup
description: >-
  First-run credential check for the **/video** and **/article** skills — detect
  which API keys / secrets are PRESENT vs MISSING (presence only; never read or
  echo a token value), and for each missing one walk the user through getting it
  set, one step at a time. Use this skill when:
    - The user says "set up /video", "set up video credentials", "check my video
      credentials", "what keys does /video need", "video-setup", "/video-setup",
      "are my ElevenLabs / Vimeo / Zoho keys set up", or anything about getting
      /video or /article ready to run.
    - OR /video or /article reports a missing or failing credential and you need
      to find out which key is absent and how to set it.
  This is a PRESENCE-ONLY check — it confirms a key *exists*, never inspects or
  prints its value. Pair with /video (make the demo video) and /article (publish
  the Zoho KB article).
---

# Video setup — first-run credential check for /video and /article

You're getting a teammate ready to run **/video** (record a narrated product
demo) and **/article** (publish that demo as a Zoho Desk KB article). Those
skills talk to a few outside services that each need a credential. This skill's
only job is to **check whether each credential is present** and, for any that
are missing, **walk the user through setting it — one step at a time, plain
language**. Reassure liberally; this is normal first-time setup.

## The one rule that matters most: presence only, never the value

This skill **only checks that a credential EXISTS.** It must **never read,
print, echo, log, or repeat a token value** — not into chat, not into a file,
not into a command's output. When you check an env var, test only whether it is
*set and non-empty*; never display what it contains. When you check a fallback
file, confirm only that the file *exists*; never open it and show its contents.

**Never ask the user to paste a secret into the chat.** Every secret is
something the user sets in **their own shell or their own file** — you tell them
*where* it comes from and *which* variable or file to put it in; they do the
pasting privately. If a user offers to paste a token here, stop them and point
them back to their shell/file.

## How to check presence (safe patterns)

Each credential resolves in this order: **environment variable → `$MOTHY_STATE_DIR`
→ `~/.mothy/.state/<file>.json`**. A credential counts as PRESENT if the env var
is set and non-empty, OR the fallback file exists.

If you're running inside Claude Code (a terminal), you can run these read-only
checks yourself. They print only `PRESENT` / `MISSING` — never a value:

```bash
# Env var presence (set + non-empty) — prints PRESENT/MISSING, never the value
for v in ELEVENLABS_API_KEY VIMEO_ACCESS_TOKEN ZOHO_CLIENT_ID ZOHO_CLIENT_SECRET ZOHO_REFRESH_TOKEN COMMANDIQ_DEMO_CAPTURE_PASSWORD; do
  if [ -n "${!v:-}" ]; then echo "$v: PRESENT (env)"; else echo "$v: MISSING (env)"; fi
done

# Fallback files (existence only — never printed/opened)
STATE="${MOTHY_STATE_DIR:-$HOME/.mothy/.state}"
for f in vimeo-creds.json zoho-creds.json; do
  if [ -f "$STATE/$f" ]; then echo "$f: PRESENT (file)"; else echo "$f: MISSING (file)"; fi
done
# ElevenLabs fallback lives in .env.local (existence only)
[ -f ".env.local" ] && echo ".env.local: PRESENT" || echo ".env.local: MISSING"
```

> Do **not** `cat`, `echo "$ELEVENLABS_API_KEY"`, `grep` a value out of a file,
> or otherwise surface a secret. Presence is a yes/no — that's all you report.

Report a short table: each key → **PRESENT** or **MISSING**. Then handle the
MISSING ones, one at a time.

## The credentials /video and /article need

### ELEVENLABS_API_KEY — voiceover (used by /video)
- **What it is:** ElevenLabs API key for text-to-speech narration.
- **Where it comes from:** ElevenLabs dashboard → **Profile → API Keys**.
- **How to set it:** export `ELEVENLABS_API_KEY` in their shell, **or** place it
  in **`.env.local`** at the project root. **Strip any surrounding quotes** from
  the key — a quoted value will fail auth.
- Tell them to paste the key into their **own shell / `.env.local`** — never here.

### VIMEO_ACCESS_TOKEN — video hosting (used by /video; NON-BLOCKING)
- **What it is:** Vimeo access token for uploading the finished MP4.
- **Where it comes from:** Vimeo developer apps → generate a token. Requires a
  **Vimeo Pro** account and the **`upload`** scope on the token.
- **How to set it:** export `VIMEO_ACCESS_TOKEN`, **or** place it at
  **`~/.mothy/.state/vimeo-creds.json`** (or under `$MOTHY_STATE_DIR`).
- This one is **optional** — see the degrade-not-abort contract below.

### ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN — KB publishing (used by /article)
- **What they are:** Zoho Self-Client OAuth credentials, used to publish the KB
  article as a **Draft** in Zoho Desk.
- **Where they come from:** Zoho API console → create a **Self-Client**. The
  refresh token must carry these scopes:
  `Desk.articles.ALL,Desk.settings.ALL,Desk.basic.READ,Desk.search.READ`.
- **How to set them:** export `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`,
  `ZOHO_REFRESH_TOKEN`, **or** place them at **`~/.mothy/.state/zoho-creds.json`**
  (a token cache `zoho-tokens.json` is created alongside it automatically — the
  user doesn't make that one).
- All three are needed together for /article to publish. Paste them into the
  shell / file privately — never into chat.

### COMMANDIQ_DEMO_CAPTURE_PASSWORD — demo login (used by /video capture)
- **What it is:** the password for the shared demo-capture login that /video
  uses to drive the live app.
- **How to set it:** export `COMMANDIQ_DEMO_CAPTURE_PASSWORD` in their shell at
  runtime. **Never** write the literal password into any file the skill creates,
  and never print it.
- Without it, /video can't log in to capture the flow — it's blocking for /video.

### Slack + Google Sheets — nothing to set up
Slack (the `#product_and_customer_success` channel + DM) and Google Sheets (the
Demo Videos tab) are reached through the **Mothy connector**, not a local
secret. There is **no key to set** for these. If the Mothy tools aren't
connected yet, that's the **/connect** skill's job, not this one.

## Degrade, don't abort

Missing a **non-blocking** credential skips **only** that one stage — it never
aborts the run:
- **Vimeo missing** → /video **skips the upload stage only**. It still produces
  the local **MP4** and sends the **Slack DM**. The teammate gets a working
  video; they just upload to Vimeo later once the token's set.
- **Zoho missing** → /article can't publish the Draft, but /video is unaffected.

A missing **blocking** credential does stop the stage that needs it:
- **ELEVENLABS_API_KEY missing** → no voiceover can be generated.
- **COMMANDIQ_DEMO_CAPTURE_PASSWORD missing** → /video can't log in to capture.

Always tell the user *which* stages still work so a partial setup isn't a dead
end.

## More detail

Full credential reference, scopes, and fallback-file shapes live in
**`docs/CREDENTIALS.md`** — point the user there for anything this check
doesn't cover.

## Do NOT

- Don't read, echo, print, log, or repeat any token / password value — presence
  is the only thing you report.
- Don't ask the user to paste a secret into the chat — secrets go into their own
  shell or file.
- Don't write the literal `COMMANDIQ_DEMO_CAPTURE_PASSWORD` (or any secret) into
  a file.
- Don't treat a missing optional cred (Vimeo) as a failure — degrade, don't abort.
- Don't try to "set up" Slack or Sheets here — those ride the Mothy connector
  (/connect), no local key.
