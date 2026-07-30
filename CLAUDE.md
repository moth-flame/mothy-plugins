# CLAUDE.md — mothy-plugins

Repo-specific guide. **General engineering rules (red-green TDD, pre-push gate,
never bypass hooks, push authorization, commit hygiene, keep-docs-current,
fix-log, sub-agent roles) live in the global `~/.claude/CLAUDE.md` — not
duplicated here.**

## What this repo is

`mothy-plugins` (`github.com/moth-flame/mothy-plugins`) is the **private
Claude Code / Cowork plugin marketplace for Moth+Flame.** It ships a single
plugin — **`mothy`** — that bundles the team agent's **skills + slash commands**
(customer briefs, capability decks, in-place Google Workspace edits, demo
videos, KB articles, onboarding).

Install:

```
/plugin marketplace add moth-flame/mothy-plugins
/plugin install mothy@mothy-marketplace
```

**Skills + commands only — no bundled MCP connector** (intentional). Mothy is
published as a separate **org connector**; bundling one here would create a dead
duplicate. The skills call the Mothy MCP tools, which the user connects once.

## Two-surface architecture (the rule that keeps this repo honest)

Mothy is two cooperating surfaces — never confuse them
(full detail: `plugins/mothy/docs/ARCHITECTURE.md`):

| Surface | Repo | Role |
| --- | --- | --- |
| **mothy PLUGIN (this repo)** | `mothy-plugins/plugins/mothy` | **Execution.** Runs locally in the Claude Code CLI — drives the real app/browser, real creds, ffmpeg, network APIs. Produces artifacts. |
| **mothy-mcp** | separate repo (`mothy-mcp`, Vercel) | **Discovery only** for the demo flows — serves playbook text + a skill index so a chat client can *find* a capability and point at the local command. Runs nothing. |

> **One-directional canonicity.** The plugin `SKILL.md` is the single source of
> truth for *how* a flow executes. The MCP playbook only **summarizes** it and
> points the user at the local command. Edits flow **plugin → playbook, never
> the reverse.** When they disagree, the plugin `SKILL.md` wins.

## Layout

- `.claude-plugin/marketplace.json` — marketplace manifest (one plugin: `mothy`).
- `plugins/mothy/.claude-plugin/plugin.json` — plugin manifest (name, version,
  metadata). Bump `version` when shipping plugin changes.
- `plugins/mothy/commands/*.md` — **thin** slash-command entrypoints (`/connect`,
  `/brief`, `/deck`, `/video`, `/article`, `/video-setup`, `/onboard`, plus the
  engineering set `/plan`, `/build`, `/test`, `/fix`).
  Frontmatter + a one-line invoke of the matching skill. **No logic here.**

  > **These shims are NOT duplicates of the same-named skills — do not "de-dupe"
  > them.** A plugin SKILL is only addressable by its *namespaced* name
  > (`/mothy:fix`); the CLI says so outright — *"Plugin skills use
  > `plugin:skill`"*. The bare `/fix` everyone actually types exists **only**
  > because `commands/fix.md` does. Deleting a shim removes the short name while
  > the plugin UI and `claude plugin details` still list the skill, so the loss is
  > invisible from every diagnostic we have.
  >
  > Beware `claude plugin details`: it counts **commands and skills together
  > under "Skills (N)"** — `brief` is a command yet appears in that list. 14
  > skills + 11 shims reads as "Skills (25)" and looks like every name is
  > registered twice. That is a counting artifact, not a collision. Misreading
  > it caused `ba6a62f`, which deleted 10 shims and broke every bare slash
  > command for the whole team; reverted in `0.4.2` and now pinned by
  > `EXPECTED_COMMANDS` in `tests/manifest.test.mjs`.
- `plugins/mothy/skills/<name>/SKILL.md` — **canonical** skill orchestration
  (connect, customer-brief, deck, edit-in-place, video, article, video-setup,
  onboard, dev-setup, plus the engineering skills plan / build / test / fix).
  The engineering skills are synced verbatim from the Mothy repo's
  `.claude/skills/{plan,build,test,fix}/` (the source of truth for the team's
  Claude-Code standard) so Cowork/desktop users get the same multi-agent
  orchestration. Re-sync when the Mothy repo versions change.
- `plugins/mothy/skills/video/tooling/` — vendored implementation scoped
  **under the video skill** (never a sibling skill, never `skills/_shared/`):
  `lib/` (Playwright/ffmpeg/ElevenLabs/creds glue), `flows/` config,
  `contract/` schemas, `assemble.mjs`, `tts.mjs`. The `article` skill reuses
  these via `${CLAUDE_PLUGIN_ROOT}/skills/video/tooling/...` rather than
  re-implementing capture; the two skills hand off through `scratchpad/.state`
  artifacts.
- `plugins/mothy/docs/` — `ARCHITECTURE.md`, `INTERFACE.md`, `CREDENTIALS.md`,
  `ONBOARDING.md`, `VIDEO-ARTICLE-RUNBOOK.md`.
- `tests/*.mjs` — `node --test` guards (manifest shape, artifact contract,
  creds resolver, vendored-tooling presence).
- `.github/workflows/` — `validate.yml` (manifest tests + optional `claude
  plugin validate --strict`) and `secret-scan.yml` (gitleaks).

## Run / test / publish

- **Test:** `node --test tests/` (no root `package.json` — pure node test
  runner). This is the portable gate; CI (`validate.yml`) runs exactly this on
  push to `main` + PRs.
- **Strict validate (if `claude` CLI present):** `claude plugin validate
  ./plugins/mothy --strict`.
- **Publish:** push to `main` on GitHub. There is no build/deploy step — the
  marketplace is just this repo; users `/plugin marketplace add` it and install.
  After a plugin change, bump `plugins/mothy/.claude-plugin/plugin.json`
  `version`.

## Conventions / gotchas

- **Secrets never live in the repo.** The MCP connection is tokenless — the token
  is minted via OAuth at connect time, never shipped. Manifest tests assert no
  token leaks into any `.mcp.json`; vendored-tooling tests assert no
  demo-capture password / ElevenLabs key literal. `.state/` (env-var fallback for
  local creds) and `.DS_Store` are gitignored. gitleaks runs in CI.
- **Skill `name` must match its directory** (manifest test enforces) — don't let
  them drift.
- **Tooling stays under the video skill**, not a sibling/shared dir — the
  `tooling-present` test pins the exact paths the skills resolve at runtime.
- **Don't surface "Mothy MCP" in customer-facing output** — use it silently,
  present results as plain findings.
- **Don't bleed `mothy-mcp` server internals (api/mcp.mjs, Vercel, Upstash)
  into this repo's docs** — they belong to the `mothy-mcp` repo. This file is
  about the plugin/marketplace.
