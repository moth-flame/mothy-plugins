# Mothy — Credentials Reference

The "which credential key goes where" reference for a new teammate. Every secret
the Mothy skills touch, where it comes from, and what breaks if it's missing.

> **Path A first.** Default `/video` (`video_make`) and demo-flow `/article`
> (`article_make`) run on **Agent37** via the Mothy MCP connector. Those paths
> need **no local** ElevenLabs / Vimeo / Zoho / demo-capture keys — secrets stay
> on Agent37. The table below is for **Path B local specialist capture** and
> machines that still use direct Zoho REST.

> **Never commit a real secret value.** Everything below is a placeholder/name.
> If you paste a real key into a file in this repo, you've made a mistake — back
> it out and rotate the key.

---

## Resolution order (env-var-first)

Every secret resolves in the **same order**. The first hit wins:

1. **Environment variable** (primary — set in your shell / CI). Recommended.
2. **`$MOTHY_STATE_DIR`** — if set, look for the fallback file there.
3. **`~/.mothy/.state/<file>.json`** — default fallback location.

Set the env var and you can ignore the fallback files entirely. The fallback
files exist only so a local dev box can persist creds without re-exporting every
session.

---

## The table

| Secret | Env var (primary) | Fallback file | How to obtain | Scope / plan | Used by (skill · stage) | Failure symptom if missing (degrade behavior) |
|---|---|---|---|---|---|---|
| ElevenLabs API key | `ELEVENLABS_API_KEY` *(strip any surrounding quotes)* | `.env.local` | ElevenLabs dashboard → **Profile → API Keys** → create key | Any paid tier with TTS quota | **video Path B** · voiceover | Path B VO fails. **Path A `video_make` unaffected** (key lives on Agent37). |
| Vimeo access token | `VIMEO_ACCESS_TOKEN` | `~/.mothy/.state/vimeo-creds.json` | Vimeo dev portal → **My Apps** → personal access token | **Vimeo Pro** + **`upload`** scope | **video Path B** · publish | Path B upload fails. **Path A unaffected.** |
| Zoho client ID | `ZOHO_CLIENT_ID` | `~/.mothy/.state/zoho-creds.json` | Zoho API console → **Self-Client** | Self-Client; Desk article scopes | **specialist Zoho REST only** | Direct REST can't mint. **Path A `article_make` + Path B `zoho_kb_*` unaffected** (server-side Zoho). |
| Zoho client secret | `ZOHO_CLIENT_SECRET` | `~/.mothy/.state/zoho-creds.json` | Same Self-Client app | Self-Client | specialist Zoho REST | Same as above. |
| Zoho refresh token | `ZOHO_REFRESH_TOKEN` | `~/.mothy/.state/zoho-creds.json` *(cache: `zoho-tokens.json`)* | Self-Client grant → refresh token | Self-Client | specialist Zoho REST | Same as above. |
| CommandIQ demo-capture password | `COMMANDIQ_DEMO_CAPTURE_PASSWORD` | *(none — env only)* | Ask Rich / team admin | Login for demo-capture user on dev app | **video Path B** · Playwright login | Path B can't log in. **Path A unaffected.** **Never write the literal password into any file.** |
| Supabase service-role key *(optional)* | `SUPABASE_SERVICE_ROLE_KEY` | `~/.mothy/.state/<file>.json` | Supabase project → service_role | Per-project | **video Path B** · seeding flows only | Seed step fails; non-seed flows OK. |
| Supabase DB URL *(optional)* | `SUPABASE_DB_URL` | `~/.mothy/.state/<file>.json` | Supabase connection string | Per-project | **video Path B** · seeding | Same as above. |

---

## Brokered via the Mothy MCP — NO local secret

**Slack**, **Google Sheets**, and **Path A video/article renders** do **not**
need local ElevenLabs / Vimeo / Zoho credentials. Authenticate the **Mothy**
org connector once (`/connect`).

- **Path A video/article** — `video_make` / `article_make` / `render_status`
  (Agent37 holds the secrets).
- **Path B hand-authored KB** — `zoho_kb_categories` / `zoho_kb_article_create`
  (server-side Zoho on mothy-mcp).
- **Slack** — `#product_and_customer_success` (channel `C05T9FA39DE`) + DM.
- **Google Sheets** — the **Demo Videos** tab in workbook
  `12MDZoe8QOjK-AYLRjUaiWRbFcblrdPVcmxzXJfvyhaE`.

Do not create env vars for these Path A / brokered paths. If they fail, it's a
connector/Agent37/permission issue, not a missing laptop secret.

---

## Non-secret configuration (config, not secrets — safe to commit)

These are IDs and labels, not credentials. Safe to write as defaults/examples in
skill config. Listed here so nobody mistakes them for secrets and tries to hide
them.

| Item | Value |
|---|---|
| Slack channel | `C05T9FA39DE` (`#product_and_customer_success`) |
| Google Sheet (workbook) | `12MDZoe8QOjK-AYLRjUaiWRbFcblrdPVcmxzXJfvyhaE` — **Demo Videos** tab |
| Zoho org ID | `830065756` |
| Zoho root KB category | **"Using CommandIQ"** *(reuse — token can't create a root category; create only sections under it)* |
| Demo app instance URL | `https://dev-commandiq.mothandflamevr.com` |
| Demo capture login | `demo-capture+vanguard@mothandflame.test` *(password is the secret above)* |
| Demo org — strategic flow | **"Vanguard Defense Group"** (leadership / readiness) |
| Demo org — technical flow | **"Vanguard Sustainment"** (CommandMRO / maintenance) |

### Zoho token limits (known, by design)

- **Cannot create a root category** (403) → reuse **"Using CommandIQ"**, create
  only **sections** under it.
- **Cannot upload images** (404) → embed per-step screenshots as **base64
  `data:` URIs** directly in the HTML answer.

---

## Quickstart (5 lines)

```bash
# 1. Export the secrets (or drop them in the fallback files above)
export ELEVENLABS_API_KEY=... VIMEO_ACCESS_TOKEN=... \
  ZOHO_CLIENT_ID=... ZOHO_CLIENT_SECRET=... ZOHO_REFRESH_TOKEN=... \
  COMMANDIQ_DEMO_CAPTURE_PASSWORD=...
# 2. Verify everything resolves
/video-setup
# 3. Make the demo video, then the KB article
/video
/article
```
