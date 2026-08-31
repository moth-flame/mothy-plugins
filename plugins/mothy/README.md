# Mothy

The **Moth+Flame team agent** for Claude Code and Cowork. This plugin ships
Mothy's **skills + slash commands** — customer briefs, capability decks,
in-place Google Workspace edits, and teammate onboarding. The skills call the
Mothy MCP tools, which you connect once (see below).

## Install (skills + commands)

In a terminal (not the app's chat box):

```
claude plugin marketplace add moth-flame/mothy-plugins
claude plugin install mothy@mothy-marketplace
```

This installs **skills + commands only — no connector.**

## Connect Mothy (one-time — required for the tools)

**Easiest: just ask Mothy to walk you through it.** As soon as the plugin is
installed, say:

> **"walk me through getting set up"**  (or run **`/connect`**)

Mothy runs its **connect** skill and guides you step-by-step — including the
exact link to generate your connector URL. No need for anyone to walk you
through it manually. (The connect skill works *before* the connector exists,
because skills load on install.)

### The steps it walks you through (reference)

Mothy is an **org connector** — it's already in everyone's connector list. No
token to mint, nothing to paste:

- **Desktop app (Chat / Cowork / Code):**
  1. **Customize → Connectors** → find **Mothy** → **Connect**.
  2. **Sign in with Google** (`@mothandflamevr.com`).
  3. On Mothy's connector page, under **Tool permissions**, set the dropdown
     (top-right) to **Always allow** — so the Mothy tools run without prompting
     on every action.
- **Terminal Claude Code CLI:** `/mcp` → `mothy` → **Authenticate** (browser
  OAuth — works because the loopback is local to the CLI).

Test: *"use mothy, run whoami"* → returns your email.

Not in the connector list / registry yet? The connect skill will tell you to
message **Rich or Chris** to get added. *(Fallback only, if the org connector
isn't available to you: generate a per-user URL at
**https://mothy-mcp.vercel.app/connect** and add it as a custom connector.)*

> **Why isn't the connector bundled in the plugin?** Mothy is published as an
> **org connector** that appears in the connector list ready to Connect — the
> plugin doesn't (and shouldn't) bundle its own MCP connector, which would only
> create a dead duplicate. The plugin ships skills + commands; the org connector
> is provisioned separately.

## Capabilities

Mothy exposes its actions through two stable MCP tools (available once the
connector is connected):

- **`mothy`** — execute any team action by name: `{action, params}`.
- **`mothy_help`** — list every available action, live (Sheets, Docs, Slides,
  Gmail, Calendar, Drive, intel search, account briefs, admin/onboarding, and
  more — ~65 actions and growing).

The action set is intentionally **not hand-listed here** — it changes often;
`mothy_help` is always current. Ask Mothy "what can you do?" to see it live.

## Skills (this plugin)

Claude invokes these proactively when your request matches — you don't have to
name them:

| Skill | Use it for | Triggers |
|-------|-----------|----------|
| **connect** | First-time setup — walks you through connecting the Mothy connector (works before the connector exists) | "walk me through getting set up", "connect mothy", "/connect" |
| **deck** | Building a customer-facing capability / pitch deck | "make a deck", "prep for a customer meeting", "draft a pitch for <prospect>", "/deck" |
| **customer-brief** | A one-pager / context load on a Moth+Flame account | "brief me on <customer>", "I have a call with <customer>", "what do we know about <account>" |
| **edit-in-place** | Editing existing Google Docs / Sheets / Slides surgically (in place, comments preserved) | "update this doc", "fix the numbers in that sheet", "tweak the speaker notes" |
| **video** | Producing a narrated product-demo video by driving the real app (Playwright + ElevenLabs VO + ffmpeg) | "/video", "make a demo video", "record a product demo", "capture a walkthrough video" |
| **article** | Turning a product-demo flow into a Zoho Desk KB article (embedded video + step-by-step walkthrough with per-action screenshots) | "/article", "make a KB article", "turn this demo into a help article", "publish a walkthrough to Zoho Desk" |
| **video-setup** | One-time setup for the `/video` + `/article` pipeline — credentials and tooling checks | "/video-setup", "set up the video pipeline", "configure demo capture" |
| **onboard** *(admin)* | Onboarding a teammate to vibe coding | "onboard @user", "set up X with vibe coding" |
| **plan** *(engineering)* | Designing a change with a multi-role sub-agent panel, then one synthesized plan | "plan this", "have a team plan this", "spawn a roundtable", "/plan" |
| **build** *(engineering)* | Executing a plan — parallel build+test sub-agents, red-green TDD, adversarial verification, local commits | "build it", "implement the plan", "ship it", "execute the plan", "/build" |
| **test** *(engineering)* | Writing red-green tests then adversarially auditing them (would they catch a broken impl?) | "test this", "write tests for X", "are these tests any good", "make sure this actually works", "/test" |
| **fix** *(engineering)* | Reproduce a bug as a failing test, root-cause it, apply the smallest fix, verify no regression | "this is broken", "debug and fix", "track down and fix", "/fix" |

The four **engineering skills** (plan → build → test → fix) bring multi-role
sub-agent orchestration to your own work: the main thread stays a conductor and
fans work out to focused sub-agents (independent role-based planners; parallel
build+test; adversarial impl-verifiers + test-auditors; read-only diagnosis
scouts). Like every skill here they **auto-fire on intent** — you don't have to
type the slash command; describing the work ("plan this", "build it", "this is
broken", "make sure it actually works") is enough.

**They are repo-agnostic, OS-agnostic, and self-configuring** (since v0.4.0):

- **They auto-detect your test command** rather than assuming one — an explicit
  command you give wins, then whatever your `CLAUDE.md` / `CONTRIBUTING.md` /
  `README.md` names, then `package.json` scripts (`test:unit`, else `test`, with
  the package manager picked from your lockfile), then a language-native default
  (`pytest`, `go test ./...`, `cargo test`, `dotnet test`, `bundle exec rspec`,
  `mvn`/`gradle`, `node --test`). If none can be determined they **ask** instead
  of guessing.
- **Browser/E2E verification is conditional** — a Playwright/Cypress/Selenium
  pass runs only if your repo actually has that setup. If it doesn't, the step is
  skipped and reported as skipped; a missing browser gate never blocks or errors.
- **Repo conventions are detected, not assumed.** `CLAUDE.md`, `AGENTS.md`,
  `CONTRIBUTING.md`, and `README.md` are read **if present** and their rules
  override the skill. All of them are optional — their absence is normal and is
  not an error. Fix-log / changelog / ADR conventions are followed if your repo
  has one; otherwise the write-up goes in the commit message body.
- **Repo-relative paths only, so they work on Windows** as well as macOS/Linux.
- **They commit locally and ask before pushing** — no push, PR, deploy, or
  migration against shared infrastructure unless you've said so.
- **Orchestration degrades gracefully.** Parallel background sub-agents are the
  preferred shape where the surface provides them (the Workflow/Task tools in
  Claude Code; Cowork's native sub-agents), but every skill runs end to end
  sequentially without them — the methodology (reproduce-first, red-green TDD,
  verifier isolation, bounded rework, the closed rubrics) is preserved either way.

## Support matrix

| Component | Claude Code | Cowork |
|-----------|-------------|--------|
| Skills (deck, customer-brief, edit-in-place, video, article, video-setup, onboard) | ✅ | ✅ |
| Engineering skills (plan, build, test, fix — multi-agent orchestration) | ✅ | ✅ |
| Slash commands (`/deck`, `/brief`, `/video`, `/article`, `/video-setup`, `/onboard`, `/plan`, `/build`, `/test`, `/fix`) | ✅ confirmed | ⏳ verify per build |
| Mothy MCP tools (via the separately-added connector) | ✅ | ✅ |
| Plugin-bundled connector OAuth | n/a (skills-only) | n/a (skills-only) |

## Notes

- Org-only for Moth+Flame (GitHub repo is public; data access is gated
  separately on your `@mothandflamevr.com` identity — the token from
  `/connect`).
- Don't surface "Mothy MCP" in customer-facing output — use it silently and
  present results as plain findings.
