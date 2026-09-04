# CLAUDE.md — mothy-plugins

Repo-specific guide. **General engineering rules (red-green TDD, pre-push gate,
never bypass hooks, push authorization, commit hygiene, keep-docs-current,
fix-log, sub-agent roles) live in the global `~/.claude/CLAUDE.md` — not
duplicated here.**

## What this repo is

`mothy-plugins` (`github.com/moth-flame/mothy-plugins`) is **Moth+Flame's
Claude Code / Cowork plugin marketplace.** The GitHub repo is public (Rich's
ruling 2026-08-30, secret-scanned clean) — no `gh auth` / org membership
needed to add it. It ships a single
plugin — **`mothy`** — that bundles the team agent's **skills + slash commands**
(customer briefs, capability decks, in-place Google Workspace edits, demo
videos, KB articles, onboarding).

Install:

```
claude plugin marketplace add moth-flame/mothy-plugins
claude plugin install mothy@mothy-marketplace
```

(Terminal spellings on purpose — end-user docs must never show `/plugin …`
slash commands; most teammates are in the desktop app where `/plugin` does not
exist. Ruling 2026-08-31.)

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

## Two DELIVERY surfaces: the plugin and Organization Skills

Claude Code loads the skills from **this plugin**. Chat and Cowork load them as
**Organization Skills** — a separate upload, because plugin installs lag (this
repo ships `check-plugin-freshness.mjs` precisely because a machine once ran
0.7.0 against a repo at 0.16.0 for weeks).

**The org copies are GENERATED, never hand-written:**

```
node scripts/build-org-bundle.mjs      # → dist/org-skills/ (gitignored)
```

Upload that directory. **Never edit a skill in the org UI** — the next sync
overwrites it, and nothing in `tests/` can see it, so the drift is invisible in
the one moment it matters: the org copy runs, misbehaves, and looks exactly like
the plugin working.

**The bundle is a deliberate subset, pinned by `tests/org-bundle.test.mjs`.**
The org surface has no hooks, no command shims, no repo and no local binaries,
so `video`/`article`/`video-setup` (Playwright, ffmpeg, ElevenLabs),
`build`/`fix`/`test`/`audit` (a runnable suite, a checkout to cite `file:line`
from) and `connect`/`dev-setup`/`update-skills` (the CLI surface itself) stay
plugin-only. `EXCLUDED` in the script states the reason for each.

**Two skills ship as SURFACE VARIANTS** rather than being excluded, because the
discipline in them is worth *more* where there is no safety net:

- **`proceed`** — keeps park/resume; the "It is automatic (installed with this
  plugin)" section is replaced by an explicit *no automatic capture here*. Left
  verbatim, that section promises three PreCompact hooks and a
  `.claude/precompact-state.md` that cannot exist on that surface. That is the
  freshness bug class exactly: an assistant believed a stale sentence and never
  opened a correct snapshot on disk.
- **`plan`** — keeps independent role passes, the conformance cross-check and
  synthesis; drops the desktop preflight (a repo STOP is wrong for a non-code
  plan) and the Workflow boilerplate, per its own §0.3 sequential fallback.

**Anchors are strict, and that is the load-bearing part.** Each cut asserts its
anchor appears exactly once and throws otherwise. Rename a heading in a plugin
skill and the BUILD fails; a forgiving builder would emit a variant that still
carries the hook promise, the upload would look fine, and the lie would be back.

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
  `ONBOARDING.md`, `VIDEO-ARTICLE-RUNBOOK.md`, `telemetry.md` (the whole of
  what the heartbeat hook sends, and how a teammate turns it off — see below).
- `plugins/mothy/hooks/` — the shipped hooks: the PreCompact pair
  (`precompact-snapshot.sh` + `auto-park.mjs`), the `UserPromptSubmit` notice
  (`post-compaction-notice.sh`), the SessionStart question-widget policy
  (`inject-mc-policy.mjs` — kill switch `MOTHY_MC_ALWAYS_ON`, default ON), the
  SessionStart pre-push arming hook (`arm-push-gate.mjs` — see below), and the
  SessionStart fleet heartbeat (`report-plugin-heartbeat.mjs` — kill switch
  `MOTHY_PLUGIN_HEARTBEAT`, default ON, see below).
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
  arming hook, and `model-tiering.test.mjs` — §0.5's worker tier must be passed
  to `agent()` in the engineering skills' worked scripts, and must NEVER land on
  a critic label (`verify:` / `audit:` / `conformance`), because a cheap critic
  rubber-stamps a bandaid and nothing in the run would look wrong).
  **`tests/integration/` DOES run on this repo's gate** — `node --test tests/`
  recurses — so anything placed there must stay hermetic and bounded. That is
  the opposite of the Mothy repo's convention, where `tests/integration/` is
  deliberately OFF the gate; do not carry that assumption across.
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

## `report-plugin-heartbeat.mjs` — the only thing that can see an ABSENT install

**The gap it closes.** `check-plugin-freshness.mjs` warns you when your install
is behind, and it ships INSIDE the plugin — so a disabled or uninstalled plugin
can never warn that it is disabled. Kevin ran 0.1.1, disabled, for 2.5 months
and no local guard could ever have spoken. **Absence is the signal**, and an
absence is only visible from off the machine. There is deliberately no `enabled`
field: a disabled plugin's hook does not run, so that field could only ever read
`true`.

Once a UTC day, SessionStart POSTs **four fields** — `install_id`,
`claimed_email`, `plugin_version`, `freshness_state` — to one compiled-in
`https://` endpoint. The field count is the point: no cwd, no repo, no hostname,
no session id, no OS, no timestamp of any kind. `plugins/mothy/docs/telemetry.md`
is the teammate-facing statement of exactly that, plus retention (45 days), who
reads it, the off switch, and the honest limits. A first-run terminal notice is
the only consent surface — the team announcement was declined.

**Constraints that all follow from this repo being PUBLIC. Do not "fix" any of
them:**

- **No secret ships.** The write is unauthenticated and the email is
  SELF-ASSERTED; the roster gate lives on the server. Accepted residual —
  nobody may later close it by shipping a token into a public repo.
- **The URL is compiled in and is NOT environment-overridable.** An
  env-overridable URL is compiled-in in name only: a poisoned shell profile
  would re-point that machine's payload at a host we never chose. The module
  reads exactly ONE environment variable, the kill switch, and no other.
- **The response body is NEVER read.** A SessionStart hook's stdout lands in the
  model context of every session on ~47 machines; parsing a server reply would
  make this an injection channel into all of them. Only the STATUS is read.
- **Two independent timing bounds** — `AbortSignal.timeout(1500)` in the module
  AND an explicit `timeout` on the hook wiring in both `hooks.json` and
  `plugin.json`. A defence whose failure mode is "session hangs at start on 47
  Macs" gets two.
- **Fail open, always exit 0.** Telemetry never costs anyone a session.

**Delivery is not "the request reached something."** `classifyDeliveryStatus` is
a closed, default-deny mapping and the single authority for it: 2xx =
`delivered`, 400 = `rejected` (the server read our bytes and refused them, so
retrying today is pointless and the slot stays claimed — the machine then shows
SILENT in the fleet report, which is the loud direction), everything else =
`not_delivered`. The rule it replaced was `status < 500`, which counted a
platform **404** — the route not deployed yet, i.e. exactly the state on a day a
plugin release lands ahead of the server one — as a stored record, burning that
machine's one daily slot forever with nothing able to notice. An outcome we
cannot read gives the day BACK.

**Freshness is NOT recomputed here** — it is the SAME verdict the local nag
renders, imported from `check-plugin-freshness.mjs`, so the two hooks can never
disagree. One known divergence, stated rather than hidden: the nag honors
`CLAUDE_CONFIG_DIR` and this module cannot (one env var, no others), so on a
relocated-config machine the reported state degrades toward `unknown`, never
toward `current`.

**Throttle failure direction:** an unwritable stamp file means every session
POSTs. That is bounded and correct — a rate limiter that cannot write must not
become a suppressor.

**Kill switch:** `MOTHY_PLUGIN_HEARTBEAT=0` (also `off`/`false`/`no`; default
ON). Off means the hook returns immediately: no file written, no request, no id
minted. Guards: `tests/plugin-heartbeat-hook.test.mjs`,
`tests/plugin-heartbeat-contract-parity.test.mjs` (proves the client's email
grammar is a SUBSET of the server's, so we never POST a 400 forever; skips when
the sibling `mothy-mcp` checkout is absent), and
`tests/integration/plugin-heartbeat-nonblocking.test.mjs` (the abort path
against a real blackhole socket and an unresolvable host).

**The server half lives in `mothy-mcp`** (`api/plugin-heartbeat.mjs` +
`lib/plugin-fleet-state.mjs`) — a separate private repo with its own deploy.
That is why the email grammar is a deliberate COPY here rather than an import:
there is no shared package a public plugin on ~47 machines could pull.

## Run / test / publish

- **Test:** `node --test --test-reporter=dot tests/` (no root `package.json` —
  pure node test runner). This is the portable gate; CI (`validate.yml`) runs
  the same tests on push to `main` + PRs.
  **Use the `dot` reporter locally and in `.githooks/pre-push`** — the default
  reporter prints ~300 TAP lines for these ~117 tests, and inside an agent
  session every one of those lines stays in context and is re-sent on every
  later turn. `dot` prints ~5 lines and still dumps failures in full. CI keeps
  the default: those logs are for a person, and cost a model nothing.
- **Strict validate (if `claude` CLI present):** `claude plugin validate
  ./plugins/mothy --strict`.
- **Publish:** push to `main` on GitHub. There is no build/deploy step — the
  marketplace is just this repo; users `claude plugin marketplace add` it and install.
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
