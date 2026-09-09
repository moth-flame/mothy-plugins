---
name: update-skills
description: Coach a Moth+Flame teammate through installing or updating the Mothy plugin in Claude Code Desktop, one pasted terminal output at a time. Use when someone says "how do I update my skills", "my skills are out of date", "/article isn't showing up", "I don't see the Mothy skills in Claude Code", "update the Mothy plugin", "the plugin says it's the latest version but it isn't", "the plugin shows as installed but I don't see the skills", "update says already on latest but the skills are missing", or pastes terminal output from a `claude plugin` command that failed or did nothing. Give ONE command at a time and read their pasted output before giving the next. Assume the person is not technical and has never used a terminal. NOT for setting up the Mothy MCP connector — teammates get that through the organization connector, not through a skill — and NOT for authoring or publishing skills.
---

# update-skills — get the Mothy skills current in Claude Code Desktop

> **THIS FILE IS CANONICAL FOR CLAUDE CODE.** Chat/Cowork get the same coach via
> `mothy-mcp/playbooks/update-skills.md` (`update_skills_playbook_get`). Same
> terminal steps. Change both copies when the steps change.

You are talking to a non-technical colleague whose Claude Code Desktop is missing the Mothy skills, or has an old copy of them. Your job is to be the terminal for them: hand over one line to paste, read what comes back, decide the next line.

## The one thing to understand before you start

There are **two separate objects** and people conflate them constantly:

| Object | What it is | Refreshed by |
|---|---|---|
| The **marketplace** | a hidden copy of the Moth+Flame plugin catalog on their laptop | `claude plugin marketplace update` |
| The **plugin** | the installed skills themselves | `claude plugin update` |

Claude Code **never refreshes the marketplace on its own.** So `claude plugin update` on its own faithfully reinstalls whatever version the stale catalog was frozen at, and reports success. This is a known Claude Code bug, not a Moth+Flame problem, and it means **the order of the two commands is the whole fix.**

Corollary you will need: the **Plugins panel in Settings shows the catalog version, not the installed one.** Measured — the panel read "0.18.0, last updated 1 hour ago" on a machine whose only installed copy was 0.8.0. Never let the panel settle an argument about what version someone has.

## How to run the conversation

**Give one command. Wait. Read the output. Then decide.** Do not paste a wall of steps — the whole point of them asking you instead of reading a document is that they do not want to interpret a decision tree.

**Every command in this coach is a TERMINAL command — never a `/plugin …` slash command.** Most teammates use the Claude desktop app, where `/plugin` does not exist; handing them a slash spelling costs a round trip just to learn that. Go straight to the Terminal path even when they say "Claude Code Desktop". The terminal spelling is never wrong: someone who does run Claude in a terminal session can use `claude plugin …` there too.

Tell them where the terminal is if they seem unsure: Applications → Utilities → Terminal on a Mac, or Git Bash on Windows. They paste the line, press Enter, then copy everything that comes back and paste it to you.

## Step 1 — always start here

Ask them to paste this and send you the result:

```
claude plugin list
```

**If their complaint is "the skills aren't showing" (rather than "my skills are out of date"), ask for this in the same round trip** — it separates stale-version from dangling-install from never-installed in one command:

```
ls ~/.claude/plugins/cache/mothy-marketplace/mothy/
```

Then branch on what comes back. **Read the Scope column on the `mothy` line** — at Moth+Flame it is almost always `managed` (IT push), and that chooses which Step 2 update command you give:

- **A list including `mothy` with Status enabled and Scope: `managed`** → they have it via IT. Go to Step 2 and use the **managed** update command (do **not** give the bare update — it fails with "not installed at scope user" and wastes a round trip).
- **A list including `mothy` with Status enabled and Scope: `user` (or `project` / `local`)** → they have a hand install. Go to Step 2 and use the **user** (bare) update command.
- **A list including `mothy` with Status enabled but Scope not shown / unclear** → ask them to paste the full `mothy` line (or the whole list) before Step 2. If you must guess at M+F, prefer managed.
- **`mothy` listed as installed and enabled, but the `ls` says `No such file or directory`** → **dangling install record**: the registry entry survived but the files are gone. Go to Step 2b — `claude plugin update` cannot fix this.
- **`failed to load` with `expected record` / `"path": ["hooks"]`** → known plugin bug through 0.24.0, not their install. Same Step 2 (pick managed vs user from Scope as above); they need **0.24.1 or later**. Do not tell them to edit JSON.
- **`command not found: claude`** (or `'claude' is not recognized…` on Windows) → they have Claude Desktop but not the Claude Code **CLI**. Do **not** hard-stop and do **not** send them into Settings → Plugins (the Update button is greyed out or lies). Go to **Step 1a** and install the CLI, then resume Step 1.
- **A list with no `mothy` line** → they have never installed it. Go to Step 3.
- **They say `/plugin` (or any slash command) "isn't recognized"** → they typed a slash command into the app's chat box. Nothing in this coach is a slash command. Point them at the Terminal (Applications → Utilities → Terminal on a Mac) and re-send the `claude plugin list` line to paste there.

## Step 1a — Install the Claude Code CLI

They need the `claude` command in a real terminal. Same one-command-at-a-time rule; assume they are not technical. Do **not** dump both OS installers — wrong OS instructions are worse than none.

**If you do not already know Mac vs Windows, ask once:** *"Quick one — Mac or Windows?"* Then give only that track.

### Mac / Linux

Give this line alone:

```
curl -fsSL https://claude.ai/install.sh | bash
```

When it finishes, tell them to **quit Terminal completely** (close the window), reopen Terminal, and paste:

```
claude --version
```

A version number means the CLI works. Resume **Step 1** with `claude plugin list`.

### Windows (PowerShell)

Confirm they are in **PowerShell** (the prompt usually starts with `PS`). Git Bash is fine for later `claude plugin …` steps, but this installer is PowerShell. Give this line alone:

```
irm https://claude.ai/install.ps1 | iex
```

When it finishes, tell them to **open a new terminal** (old windows do not pick up PATH), then:

```
claude --version
```

A version number means the CLI works. Resume **Step 1** with `claude plugin list`.

### Still `command not found` after install

1. **New terminal first** — the most common miss. Close every terminal window, open a fresh one, re-run `claude --version`.
2. **Git missing** (install scripts or later plugin steps may need it) → hand them off to `/dev-setup` for Git, then come back here.
3. **Avoid npm** (`npm install -g @anthropic-ai/claude-code`) unless the native installer above failed — native is the supported path for non-technical teammates.
4. Official docs if they want a second source: https://code.claude.com/docs/en/setup

Once `claude --version` works, go back to **Step 1** — do not jump ahead to marketplace/update until `claude plugin list` has branched them correctly.

## Step 2 — updating an existing install (the common case)

Marketplace first, then the plugin update that matches the Scope from Step 1. Give **one line at a time**.

```
claude plugin marketplace update mothy-marketplace
```

Expect `✔ Successfully updated marketplace: mothy-marketplace`. Then pick **exactly one** of the two plugin-update lines below — based on Scope from Step 1 — and give that as the next command:

**Scope was `managed` (the normal Moth+Flame / IT-push path — use this first when Step 1 showed managed):**

```
claude plugin update mothy@mothy-marketplace --scope managed
```

**Scope was `user` (or `project` / `local` — hand install only):**

```
claude plugin update mothy@mothy-marketplace
```

Do **not** lead with the bare update when Scope was managed. Bare update looks for a user-scope install and fails with `Plugin "mothy" is not installed at scope user` — that is a wasted round trip, not a diagnostic step.

Expect `✔ Plugin "mothy" updated from <old> to <new>`. Then tell them to **quit Claude completely and reopen it** — the update does not apply to a running session.

### If you gave the wrong scope and the update errors

Full error shapes you may still see if Scope was misread: `Plugin "mothy@mothy-marketplace" is installed in managed scope, not user.` or `Plugin "mothy" is not installed at scope user`. Re-run the plugin-update line with the **other** form above (managed ↔ bare). Do not restart from marketplace update unless they skipped it.

**If they try to UNINSTALL and get an error telling them to use `--scope managed`, ignore the advice in the error.** `uninstall --scope` accepts only `user`, `project`, `local` — the error names a flag that command does not take. `update --scope managed` is the one that works. Do not send them round that loop; it wastes their afternoon.

### If it says it is already on the latest version, but they know it isn't

They almost certainly ran `claude plugin update` **without** the marketplace line first. Go back and run both, in order. This is the single most common failure and it is silent.

**If they DID run both in order and it still says already on latest while the skills are missing**, do not keep re-running update — run the Step 1 `ls`. A dangling install (Step 2b) reports "already on latest" forever, because `update` compares the recorded version against the catalog and never rewrites files.

## Step 2b — installed but the skills don't show up (and update says already on latest)

The shape: "the plugin shows as installed but I don't see the skills", or "update says already on latest but the skills are missing". `claude plugin list` shows `mothy` installed and enabled, `claude plugin update` reports latest — and nothing loads.

The decisive diagnostic (same as Step 1's):

```
ls ~/.claude/plugins/cache/mothy-marketplace/mothy/
```

`No such file or directory` while `claude plugin list` says installed = a **dangling install record**: the registry entry survived, the cached files are gone. This can happen after a failed or interrupted install, or a cache cleanup. `claude plugin update` cannot repair it — update compares the recorded version number against the catalog and never rewrites files, so it says "already on latest" about files that do not exist.

The fix, one command at a time:

```
claude plugin marketplace update mothy-marketplace
```

Then — **INSTALL, not update**, because install rewrites the files where update short-circuits on the matching version number:

```
claude plugin install mothy@mothy-marketplace
```

If install refuses with "already installed", have the CLI clear its own record and reinstall:

```
claude plugin uninstall mothy@mothy-marketplace && claude plugin install mothy@mothy-marketplace
```

This CLI uninstall+install is the sanctioned repair for the dangling case — never hand-delete cache folders or edit `installed_plugins.json`. (If uninstall hits the managed-scope error, remember the Step 2 caveat: `uninstall --scope` accepts only `user`, `project`, `local` — the error's `--scope managed` advice names a flag that command does not take.)

Then tell them to **quit Claude completely and reopen it**, and confirm with the Step 4 `ls` check.

## Step 3 — first-time install

```
claude plugin marketplace add moth-flame/mothy-plugins
```

The `mothy-plugins` repository is public, so this should just work — no GitHub sign-in needed.

**If it fails with an authentication or permission error**, the repo may have been made private again — sort GitHub sign-in first:

```
gh auth login
```

Choose GitHub.com → HTTPS → yes to authenticate git → Login with a web browser. They copy the code shown, press Enter, and approve in the browser that opens.

If `gh` is also `command not found`, they do not have the GitHub CLI. On a Mac: `brew install gh`. On Windows, Git Bash usually ships with a credential helper and a plain browser sign-in prompt will appear on first use instead. Re-run the `marketplace add` line after signing in.

Once the marketplace is added:

```
claude plugin install mothy@mothy-marketplace
```

Then quit and reopen Claude.

## Step 4 — confirm it actually worked

Do not trust a version number to prove this; the metadata is unreliable (there is a known bug where the recorded commit is not updated even when the files are). **Check for a file that only exists in current versions:**

```
ls ~/.claude/plugins/cache/mothy-marketplace/mothy/*/hooks/
```

If `check-plugin-freshness.mjs` appears, the current content is genuinely on disk. Also fine as a soft check: ask them to type `/` in Claude Code and confirm the Mothy skills (`/article`, `/deck`, `/plan`) are listed.

Old version folders left on disk are harmless — they are the rollback.

## Reading unfamiliar terminal output

If they paste something not covered above, do not guess and do not send them another command hopefully. Say what you can see, say what you cannot, and ask for one specific extra thing — usually the output of `claude plugin list` or `claude plugin marketplace list`. Guessing costs them a round trip and their confidence.

Two things worth saying out loud when they hit trouble, because people assume the opposite: **nothing they did broke this**, and **the update problem is a Claude Code bug that affects everyone**, not a Moth+Flame misconfiguration. It has open issues upstream and no fix yet, which is why this coaching exists at all.

## What NOT to tell them

- Do not give `/plugin …` slash-command spellings — not even as a first attempt. The desktop app has no `/plugin`, and the person cannot tell a slash command from a terminal one. Every command here starts `claude plugin …` and is pasted into the Terminal.
- Do not send them to Settings → Plugins to click Update. The button is greyed out or reports "On latest version" against a stale catalog.
- Do not tell them to run `/status` — it does not exist in Claude Desktop.
- Do not suggest reinstalling the app, hand-deleting folders under `~/.claude`, or editing `installed_plugins.json` by hand — that creates a mess someone else has to unpick. For an ordinary stale install the two commands in Step 2 are the fix; for a dangling install the sanctioned repair is the CLI's own `uninstall` + `install` (Step 2b), never a hand-deleted folder.
- Do not ask them to share a token, password, or the contents of any file under `~/.claude`.
- Do not tell them to wrap or edit `hooks.json` / `plugin.json`. A `Hook load failed` / `expected record` error through 0.24.0 is a plugin bug; updating to 0.24.1+ is the fix.
