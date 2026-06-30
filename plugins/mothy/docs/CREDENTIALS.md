# Mothy — Credentials Reference

The "which credential key goes where" reference for a new teammate. Every secret
the Mothy skills touch, where it comes from, and what breaks if it's missing.

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
| ElevenLabs API key | `ELEVENLABS_API_KEY` *(strip any surrounding quotes)* | `.env.local` | ElevenLabs dashboard → **Profile → API Keys** → create key | Any paid tier with TTS quota | **video** · voiceover generation | No voiceover. `/video` cannot synthesize narration — VO step fails; video render aborts or produces a silent draft. |
| Vimeo access token | `VIMEO_ACCESS_TOKEN` | `~/.mothy/.state/vimeo-creds.json` | Vimeo dev portal → **My Apps** → generate a personal access token | **Vimeo Pro** + the **`upload`** scope (token must include upload) | **video** · publish/host · **article** · embed | Upload fails (or 403 on missing `upload` scope). `/video` can't host the asset; `/article` has no hosted video to embed at the top. |
| Zoho client ID | `ZOHO_CLIENT_ID` | `~/.mothy/.state/zoho-creds.json` | Zoho API console → **Self-Client** app → Client ID | Self-Client; scopes: `Desk.articles.ALL,Desk.settings.ALL,Desk.basic.READ,Desk.search.READ` | **article** · auth (token mint) | No Zoho auth → no token. `/article` cannot create the Desk draft at all. |
| Zoho client secret | `ZOHO_CLIENT_SECRET` | `~/.mothy/.state/zoho-creds.json` | Same Self-Client app → Client Secret | Self-Client (pairs with client ID) | **article** · auth (token mint) | Same as above — token mint fails, `/article` cannot publish the draft. |
| Zoho refresh token | `ZOHO_REFRESH_TOKEN` | `~/.mothy/.state/zoho-creds.json` *(cached access token: `~/.mothy/.state/zoho-tokens.json`)* | Generate a grant token in the Self-Client console with the scopes above, then exchange it once for a refresh token | Self-Client; same scope set | **article** · auth (access-token refresh) | Access token can't be refreshed → `/article` Desk calls 401 after the cached token expires. |
| CommandIQ demo-capture password | `COMMANDIQ_DEMO_CAPTURE_PASSWORD` | *(none — env only)* | Ask Rich / team admin for the shared demo-capture login password | Login for `demo-capture+vanguard@mothandflame.test` on `https://dev-commandiq.mothandflamevr.com` | **video** · demo capture (Playwright login) | Playwright can't log in to the demo app → no screen capture → `/video` (and the per-step artifacts `/article` consumes) can't be produced. **Never write the literal password into any file** — read it from the env var at runtime only. |
| Supabase service-role key *(optional)* | `SUPABASE_SERVICE_ROLE_KEY` | `~/.mothy/.state/<file>.json` | Supabase project → **Settings → API → service_role** | Per-project service role | **video** · only flows that **seed** demo data | Only needed when a flow seeds data. If absent and a flow needs seeding, the seed step is skipped/fails; flows that don't seed are unaffected. |
| Supabase DB URL *(optional)* | `SUPABASE_DB_URL` | `~/.mothy/.state/<file>.json` | Supabase project → **Settings → Database → Connection string** | Per-project Postgres connection | **video** · only flows that **seed** demo data | Same as above — required only for seeding flows; otherwise ignored. |

---

## Brokered via the Mothy MCP — NO local secret

**Slack** and **Google Sheets** do **not** need any local credential. They are
brokered through the **Mothy MCP** connector (org connector — you authenticate
once via the connector, not via a key in this repo).

- **Slack** — `#product_and_customer_success` (channel `C05T9FA39DE`) + DM.
- **Google Sheets** — the **Demo Videos** tab in workbook
  `12MDZoe8QOjK-AYLRjUaiWRbFcblrdPVcmxzXJfvyhaE`.

Do not create env vars or fallback files for these. If a Slack/Sheets action
fails, it's a connector/permission issue (re-auth the Mothy connector), not a
missing secret.

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
