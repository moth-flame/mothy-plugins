# Mothy plugin — `/video` ⇄ `/article` interface spec

The contract between the `/video` (producer) and `/article` (consumer) skills, plus
the external APIs both depend on. This spec is **CommandIQ-independent**: it describes
the *shape* of the artifacts and the *auth surface*, not the specifics of any one app,
flow, org, or demo script. A different product, a different flow, or a different
narrator can be dropped in without changing a word here.

The two skills communicate **only** through files on disk under a per-video scratchpad
directory. `/article` never re-drives the browser, never re-renders, and never re-calls
ElevenLabs or Vimeo — it reads what `/video` already wrote. If the artifacts below are
present and well-formed, `/article` can run with zero access to the running app.

---

## 1. Artifact contract

`/video` **produces** the following artifacts. `/article` **consumes** the subset
marked *(article)*. All paths are relative to a per-video scratchpad root,
`scratchpad/<video>/`, where `<video>` is a slug for the captured flow.

### 1.1 Final video — `<video>.mp4`

The deliverable. Single assembled MP4.

| Property   | Value                          |
| ---------- | ------------------------------ |
| Resolution | 1920×1080                      |
| Video codec| H.264 (`h264`)                 |
| Audio codec| AAC (`aac`)                    |
| Container  | MP4                            |

Produced by ffmpeg from the per-beat captures + the ElevenLabs voiceover. Uploaded to
Vimeo (§1.4); `/article` embeds the **Vimeo** player, not this raw file, so the MP4
itself is not an `/article` input — `vimeo-uploads.json` is.

### 1.2 Per-step screenshots — `steps/<beat>-NN-<label>.png` *(article)*

One PNG **per click/type action** — every discrete user action the demo performs
produces exactly one screenshot. This is what gives the article *step-by-step parity*
with the video: a reader sees the same sequence of states a viewer sees.

- Directory: `scratchpad/<video>/steps/`
- Filename: `<beat>-NN-<label>.png`
  - `<beat>` — the beat slug the step belongs to (groups steps; see §1.3 `beat`).
  - `NN` — zero-padded ordinal **within the beat** (`01`, `02`, …).
  - `<label>` — short kebab slug for the action (e.g. `open-readiness-tab`).
- One image per action. No action → no screenshot. Multi-action beats produce
  multiple PNGs sharing the `<beat>` prefix.

### 1.3 Step index — `steps.json` *(article)*

The ordered, machine-readable index of every step. This is the spine `/article` walks
to emit the written walkthrough. It is **idx-contiguous**: `idx` runs `0, 1, 2, …` with
no gaps across the whole flow, regardless of beat boundaries.

Each entry:

| Field      | Type   | Meaning                                                          |
| ---------- | ------ | ---------------------------------------------------------------- |
| `idx`      | int    | Global step ordinal, contiguous from 0 across all beats.         |
| `beat`     | string | Beat slug this step belongs to (matches the PNG `<beat>` prefix).|
| `beatIdx`  | int    | Ordinal of the step *within its beat* (0-based).                 |
| `action`   | string | The action kind, e.g. `click`, `type`, `nav`, `wait`.            |
| `label`    | string | Kebab slug for the action (matches the PNG `<label>`).           |
| `file`     | string | Path to the step PNG, relative to the scratchpad root (§1.2).    |
| `instruction` | string | Human-readable imperative for the reader, e.g. "Click the Readiness tab." |
| `ts`       | number | Timestamp / offset (seconds) of the step in the assembled video. |

Example (shape only):

```json
[
  {
    "idx": 0,
    "beat": "open-dashboard",
    "beatIdx": 0,
    "action": "nav",
    "label": "load-app",
    "file": "steps/open-dashboard-01-load-app.png",
    "instruction": "Open the dashboard.",
    "ts": 0.0
  },
  {
    "idx": 1,
    "beat": "open-dashboard",
    "beatIdx": 1,
    "action": "click",
    "label": "readiness-tab",
    "file": "steps/open-dashboard-02-readiness-tab.png",
    "instruction": "Click the Readiness tab.",
    "ts": 3.4
  }
]
```

Invariants `/article` may rely on:
- `idx` is dense and starts at 0.
- For each beat, `beatIdx` is dense and starts at 0.
- Every `file` exists on disk and matches `steps/<beat>-NN-<label>.png`.
- `(beat, label)` pair encoded in `file` agrees with the `beat`/`label` fields.

### 1.4 Vimeo upload record — `vimeo-uploads.json` *(article)*

The result of uploading `<video>.mp4` to Vimeo. `/article` reads this to build the
embedded player iframe at the top of the article.

| Field              | Type   | Meaning                                              |
| ------------------ | ------ | ---------------------------------------------------- |
| `id`               | string | Vimeo video id.                                      |
| `link`             | string | Canonical `vimeo.com/<id>` watch URL.                |
| `player_embed_url` | string | The `player.vimeo.com/video/<id>` URL for the iframe.|
| `duration`         | number | Video duration in seconds.                           |
| `privacy`          | string | Vimeo privacy setting (e.g. `unlisted`, `disable`).  |

Example (shape only):

```json
{
  "id": "1029384756",
  "link": "https://vimeo.com/1029384756",
  "player_embed_url": "https://player.vimeo.com/video/1029384756",
  "duration": 92.4,
  "privacy": "unlisted"
}
```

---

## 2. How `/article` consumes the artifacts

`/article` produces a Zoho Desk Knowledge Base article (always a **Draft**) with this
structure, sourced entirely from §1.3 + §1.4:

1. **Embedded video at the top.** An `<iframe>` built from
   `vimeo-uploads.json.player_embed_url`, so the reader can watch the full demo first.
2. **Step-by-step walkthrough.** Walk `steps.json` in `idx` order. For **each** step,
   emit one `img` (the step PNG from `file`) followed by its `instruction`. The result
   mirrors the video click-for-click: one screenshot + one instruction per action.

Because Zoho's token cannot upload images (see §3), step PNGs are embedded as base64
`data:` URIs inline in the HTML answer rather than uploaded as attachments.

---

## 3. External API surface

Both skills lean on the following external tools/APIs. Auth columns describe the
*credential surface* only — see the credentials note in §4.

| API / Tool        | Used by   | Purpose                                    | Auth                                                                 | Notes |
| ----------------- | --------- | ------------------------------------------ | ------------------------------------------------------------------- | ----- |
| Playwright        | `/video`  | Drive the real running app; capture per-step PNGs. | Demo-capture login (app session), not an API key.                   | Headless/headed browser. One screenshot per click/type. |
| ElevenLabs        | `/video`  | Generate voiceover audio from the VO script. | `ELEVENLABS_API_KEY` (strip surrounding quotes).                    | Value-first VO; assembled into the MP4 audio track. |
| ffmpeg            | `/video`  | Assemble PNG captures + VO into the final MP4. | None (local binary).                                                | Output: 1920×1080 h264/aac MP4. |
| Vimeo (tus upload)| `/video`  | Upload final MP4; get embed URL.            | `VIMEO_ACCESS_TOKEN` (Vimeo Pro + `upload` scope).                  | Resumable `tus` upload. Writes `vimeo-uploads.json`. |
| Slack             | `/video`  | Post the finished video link to the team.   | Brokered via **Mothy MCP** — no local secret.                      | Channel `C05T9FA39DE` (`#product_and_customer_success`) + DM. |
| Google Sheets     | `/video`  | Log the video in the Demo Videos tracker.   | Brokered via **Mothy MCP** — no local secret.                      | "Demo Videos" tab, workbook `12MDZoe8QOjK-AYLRjUaiWRbFcblrdPVcmxzXJfvyhaE`. |
| Zoho Desk         | `/article`| Publish the KB article (Draft).             | `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` (Self-Client). | Org `830065756`. Scopes: `Desk.articles.ALL`, `Desk.settings.ALL`, `Desk.basic.READ`, `Desk.search.READ`. See §3.1. |

### 3.1 Zoho Desk token limits

The Self-Client token is deliberately narrow. `/article` must work within these:

- **Cannot create a root category** (403). Reuse the existing root category
  `Using CommandIQ`; only create **sections** under it.
- **Cannot upload images** (404). Embed per-step screenshots as base64 `data:` URIs
  directly in the HTML answer (see §2).
- Articles are always created as **Draft**, never published live.

---

## 4. Credential resolution

All secrets are resolved **env-var-first**, in this order:

1. The named environment variable.
2. `$MOTHY_STATE_DIR/<file>.json`.
3. `~/.mothy/.state/<file>.json`.

| Credential                                              | Env var(s)                                               | Fallback file                              |
| ------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| ElevenLabs                                              | `ELEVENLABS_API_KEY` (strip surrounding quotes)          | `.env.local`                               |
| Vimeo                                                   | `VIMEO_ACCESS_TOKEN` (Pro + `upload` scope)              | `~/.mothy/.state/vimeo-creds.json`         |
| Zoho Desk                                               | `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` | `~/.mothy/.state/zoho-creds.json` (+ `zoho-tokens.json` cache) |
| Slack / Google Sheets                                   | — (brokered via Mothy MCP)                               | none — no local secret                     |

Demo-capture login (for Playwright) uses a runtime password from
`COMMANDIQ_DEMO_CAPTURE_PASSWORD` — never write the literal password into any file.

---

## NOT IMPLEMENTED — discovery-only MCP

An earlier draft of this design proposed **executable** `make_demo_video` MCP actions —
i.e. having the Mothy MCP itself drive the browser, render the video, and upload it.

**This was rejected.** A Vercel function (where the Mothy MCP runs) has no browser and
no ffmpeg: it cannot run Playwright, cannot invoke ffmpeg, and cannot do a resumable
Vimeo `tus` upload of a large local file. Video production therefore lives entirely in
the **local** `/video` skill (Playwright + ElevenLabs + ffmpeg + Vimeo on the user's
machine).

The MCP's role is **discovery-only** — surfacing config, brokering Slack/Sheets, and
returning playbook/account data — never executing the capture/render/upload pipeline.
