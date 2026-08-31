---
name: update-skills
description: Coach a Moth+Flame teammate through installing or updating the Mothy plugin in Claude Code Desktop, one pasted terminal output at a time. Use when someone says "how do I update my skills", "my skills are out of date", "/article isn't showing up", "I don't see the Mothy skills in Claude Code", "update the Mothy plugin", "the plugin says it's the latest version but it isn't", or pastes terminal output from a `claude plugin` command that failed or did nothing. Give ONE command at a time and read their pasted output before giving the next. Assume the person is not technical and has never used a terminal. NOT for setting up the Mothy MCP connector — teammates get that through the organization connector, not through a skill — and NOT for authoring or publishing skills.
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

Then branch on what comes back:

- **A list including `mothy` with Status enabled** → they have it. Go to Step 2 to update it.
- **`failed to load` with `expected record` / `"path": ["hooks"]`** → known plugin bug through 0.24.0, not their install. Same Step 2; they need **0.24.1 or later**. Do not tell them to edit JSON.
- **`command not found: claude`** → they have Claude Desktop but not the command-line tool. Stop and say so plainly: this update cannot be done from the Desktop app's buttons today, and they need either the Claude Code CLI installed or someone with a terminal to do it for them. Do not send them into the Settings panel to hunt for an Update button — it is greyed out or lies, and that is a known bug.
- **A list with no `mothy` line** → they have never installed it. Go to Step 3.
- **They say `/plugin` (or any slash command) "isn't recognized"** → they typed a slash command into the app's chat box. Nothing in this coach is a slash command. Point them at the Terminal (Applications → Utilities → Terminal on a Mac) and re-send the `claude plugin list` line to paste there.

## Step 2 — updating an existing install (the common case)

Two lines, **in this order**, given one at a time:

```
claude plugin marketplace update mothy-marketplace
```

Expect `✔ Successfully updated marketplace: mothy-marketplace`. Then:

```
claude plugin update mothy@mothy-marketplace
```

Expect `✔ Plugin "mothy" updated from <old> to <new>`. Then tell them to **quit Claude completely and reopen it** — the update does not apply to a running session.

### If the second line says the plugin is in "managed scope"

Full error: `Plugin "mothy@mothy-marketplace" is installed in managed scope, not user.` That means the plugin was pushed to them by Moth+Flame IT rather than installed by hand, which is normal and fine. Re-run just the second line with a scope flag:

```
claude plugin update mothy@mothy-marketplace --scope managed
```

**If they try to UNINSTALL and get that same error telling them to use `--scope managed`, ignore the advice in the error.** `uninstall --scope` accepts only `user`, `project`, `local` — the error names a flag that command does not take. `update --scope managed` is the one that works. Do not send them round that loop; it wastes their afternoon.

### If it says it is already on the latest version, but they know it isn't

They almost certainly ran `claude plugin update` **without** the marketplace line first. Go back and run both, in order. This is the single most common failure and it is silent.

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
- Do not suggest reinstalling the app, clearing caches by hand, or deleting folders under `~/.claude`. The two commands in Step 2 are the fix; hand-deleting install records creates a mess someone else has to unpick.
- Do not ask them to share a token, password, or the contents of any file under `~/.claude`.
- Do not tell them to wrap or edit `hooks.json` / `plugin.json`. A `Hook load failed` / `expected record` error through 0.24.0 is a plugin bug; updating to 0.24.1+ is the fix.
