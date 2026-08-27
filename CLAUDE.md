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
  `/brief`, `/deck`, `/video`, `/article`, `/video-setup`, `/onboard`,
  `/edit-in-place`, `/dev-setup`, `/mc`, `/update-skills`, plus the engineering set `/plan`, `/build`,
  `/test`, `/fix`, `/audit`). **Every skill that users are told to invoke by
  name needs one** — `audit` and `dev-setup` shipped for weeks advertising
  `/audit` and `/dev-setup` in their own `description:` while no such command
  existed (added 0.4.3).
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
  **NOT actually verbatim, and must not be** — `51a6f46` made these copies repo- and
  OS-agnostic, and each of `plan`/`build`/`test`/`fix`/`audit` additionally carries a
  `<!-- BEGIN desktop-preflight -->` block: they assume a checked-out repo with a
  runnable test suite, which is true on Agent37 and false for a teammate invoking them
  from the Claude desktop app. **Re-sync must PRESERVE that block** — it is pinned by
  `PREFLIGHT_SKILLS` in `tests/manifest.test.mjs`, so a careless overwrite reddens CI
  rather than silently shipping a skill that spawns agents and then fails confusingly.
  Otherwise, the engineering skills track the Mothy repo's
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
- `plugins/mothy/hooks/` — the shipped hooks: the PreCompact pair
  (`precompact-snapshot.sh` + `auto-park.mjs`), the `UserPromptSubmit` notice
  (`post-compaction-notice.sh`), the SessionStart question-widget policy
  (`inject-mc-policy.mjs` — kill switch `MOTHY_MC_ALWAYS_ON`, default ON), and
  the SessionStart pre-push arming hook (`arm-push-gate.mjs` — see below).
  **Wiring is deliberately duplicated in `hooks/hooks.json` AND
  `.claude-plugin/plugin.json`** because we do not know which one a given
  Claude Code version reads. The event maps must stay identical, but the
  FILE shape is different: `hooks.json` must be `{ "hooks": { …events } }`
  (Claude Code 2.1+ validates that file as a record under a `hooks` key —
  a top-level event map fails the whole plugin, lived through 0.24.0).
  `plugin.json`'s `"hooks"` key already IS that wrapper, so its value is
  the event map. `tests/hook-wiring.test.mjs` pins both facts.
- `tests/*.mjs` — `node --test` guards (manifest shape, artifact contract,
  creds resolver, vendored-tooling presence, the compaction hooks, the pre-push
  arming hook).
- `.githooks/pre-push` — this repo's OWN gate (runs `node --test tests/`).
  Tracked, so it rides a clone; armed per clone by `arm-push-gate.mjs` or by
  hand with `git config core.hooksPath .githooks`.
- `.github/workflows/` — `validate.yml` (manifest tests + optional `claude
  plugin validate --strict`) and `secret-scan.yml` (gitleaks).

## `arm-push-gate.mjs` — arming the gate the repo already declares

**The gap it closes.** Git hooks are PER-CLONE and neither delivery mechanism
survives a clone alone: `.git/hooks/*` is never cloned, and `core.hooksPath`
pointing at a tracked `.githooks/` makes the hook FILES ride the checkout while
the POINTER stays in local git config — also not cloned, set once by whichever
machine ran the repo's `install-hooks.sh`. So a fresh clone (and every cloud
session) pushes with **no pre-push gate at all, silently**. A money-moving repo
was pushed that way; it was caught only because the session happened to look.

**Decision order** (pure `decideArming()` over injected observations):

| # | Condition | Action |
|---|---|---|
| 1 | `MOTHY_ARM_PUSH_GATE` is `0`/`off`/`false`/`no` | nothing, silent |
| 2 | not inside a git work tree | nothing, silent |
| 3 | an effective `pre-push` exists **and is executable** | nothing, silent |
| 4 | `core.hooksPath` set to something that is NOT a tracked hooks dir | **do not override** — operator's choice — silent |
| 5 | tracked `.githooks/`/`githooks/` holds a `pre-push` | `git config core.hooksPath <dir>` + `chmod +x`, then **RE-PROBE** |
| 6 | a known installer exists (`scripts/install-hooks.sh`, `scripts/install-git-hooks.sh`, `bin/install-hooks.sh`, `install-hooks.sh`) | run it, then **RE-PROBE** |
| 7 | none of the above, but `CLAUDE.md`/`AGENTS.md` mentions a pre-push gate | **WARN**, naming every path searched |
| 8 | none of the above, repo declares nothing | silent |

**The three rules, and why each is there:**

- **NEVER synthesize a hook, never guess a test command.** A wrong command
  blocks every push in that repo with a confusing error — worse than the gap.
  The module carries **no file-writing primitive at all** (a source-level test
  enumerates `writeFileSync`/`mkdirSync`/… and forbids them); `chmodSync` only
  changes the mode of a file the repo already authored.
- **The exit code is never the verdict — RE-PROBE.** An installer that exits 0
  and installs nothing must warn, not report success. Same doctrine as the
  dist-patch marker re-grep in the Mothy repo.
- **Step 7 is the load-bearing half.** The bug being fixed is not "no gate", it
  is "no gate, and nobody could tell". A hook that silently gives up there
  rebuilds it exactly. Equally: steps 1-4 and 8 say **nothing** — unsolicited
  noise in every unrelated repo is how a real warning gets ignored.

**THE PROBE TRAP — `.git/hooks/pre-push` IS A FALSE NEGATIVE.** In a
`core.hooksPath` repo that file does not exist and the gate is fully armed;
measured in the Mothy repo on 2026-08-20, where the probe said "absent" about a
working gate. The only correct probe resolves the config:

```
git rev-parse --git-path hooks/pre-push     # → .githooks/pre-push, or ../../.githooks/pre-push from a subdir
```

It returns a path relative to the CWD it ran in, so resolve it against that CWD.
A source-level test forbids the literal `.git/hooks/pre-push` in this module.

**Kill switch:** `MOTHY_ARM_PUSH_GATE=0` (default ON — a gate nobody arms is the
status quo this fixes). Fail-open everywhere: exits 0 on every path, and the
wiring wraps it in `2>/dev/null || true`.

**What it cannot do:** it cannot tell whether the repo's gate is any *good*, it
cannot arm anything for a repo that never authored a hook, and its step-7
warning depends on the repo documenting its own rule in `CLAUDE.md`/`AGENTS.md`.

## `inject-mc-policy.mjs` — always-on question widgets

**The gap it closes.** `/mc` used to turn on AskUserQuestion only *after* someone
typed it. Teammates never type it, so blocking questions land as prose that
scrolls off a feed and sit unanswered. This SessionStart hook prints a short
`<mc-policy>` block on ordinary session starts so the model uses the widget
without waiting for `/mc`.

**Kill switch:** `MOTHY_MC_ALWAYS_ON=0` (default ON). Off-values `0|off|false|no`.
Skips `source=compact` so auto-compact does not repeat the block. Always exit 0;
wiring is `2>/dev/null || true`. READ-ONLY. The `/mc` skill still works when
invoked even if the hook is off.

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
