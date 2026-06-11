---
name: dev-setup
description: >-
  Get a brand-new (non-technical) Moth+Flame teammate's Mac ready to use Claude
  Code — install the prerequisites Claude Code needs, chiefly **Git** (which on a
  fresh Mac means installing **Homebrew** first). Use this skill when:
    - Claude Code says **"git is required"**, **"git: command not found"**,
      **"install git"**, or won't open/clone a folder because Git is missing.
    - The user says "set up my computer for coding", "get me ready to use Claude
      Code", "I've never coded before", "install git", "what's Homebrew",
      "command not found: brew", "/dev-setup", or anything about installing the
      developer tools on their Mac.
  Assume the user has NEVER opened Terminal, never installed Homebrew, and is not
  technical. Walk them one step at a time. (macOS — the team is on Macs.)
---

# Dev setup — get a Mac ready for Claude Code (Git via Homebrew)

You're getting a **non-technical** teammate's Mac ready to use Claude Code.
Claude Code needs **Git**; a fresh Mac usually has neither Git nor **Homebrew**
(the installer that gets Git). You'll walk them through it **conversationally,
ONE step at a time, plain language** — no jargon, no dumping all steps at once.
After each step, wait for them to say "done" (or paste what they see) before the
next one. Reassure liberally — this is normal first-time setup, nothing is
broken.

## If you ARE running inside Claude Code (terminal)

You can run the read-only checks and the non-interactive installs yourself —
don't make the user do what you can do:

1. Run `git --version`. If it prints a version, **Git is already installed — you're
   done.** Tell them and stop.
2. Run `uname -m` (→ `arm64` = Apple Silicon M-series; `x86_64` = Intel) and
   `brew --version`.
3. If `brew` is missing → guide the user through **Step A** below (the Homebrew
   installer needs *their* Mac password typed into *their* Terminal — you can't
   type it for them, so this part is hands-on for them).
4. Once `brew --version` works, **you** can run `brew install git` yourself
   (Homebrew installs don't need a password), then `git --version` to confirm.

In Cowork (no terminal) you can't run anything — just give the steps as guidance.

---

## Step A — Open Terminal

1. Press **Command (⌘) + Space** to open Spotlight.
2. Type **terminal** and press **Return**.
3. A window with a text prompt opens. That's Terminal — you type commands here.
→ Tell them: "It looks bare, that's normal. We'll paste in a few commands."

## Step B — Install Homebrew (the tool that installs Git)

Have them **copy this whole line**, paste it into Terminal, and press **Return**:

```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

What they'll see, and what to tell them:
- **It asks for your password.** This is their **Mac login password**. ⚠️ **The
  password is invisible as you type — no dots, no stars, nothing moves. That's
  normal and on purpose.** Just type it and press **Return**. (Aaron got stuck
  here — pre-empt it.)
- It may say it's installing the **Xcode Command Line Tools** first and take a
  few minutes. Let it run. ☕
- It prints a lot of text. When it stops and gives you the prompt back, it's done.
→ Wait for them to say it finished.

## Step C — Add Homebrew to the PATH (Apple Silicon — the step everyone misses)

On **Apple Silicon Macs (M1/M2/M3)**, Homebrew installs to a spot the Terminal
can't see yet, so typing `brew` gives **"command not found"** until you do this.
At the very end of Step B, Homebrew printed a box titled **"Next steps:"** with
**two `eval`/`echo` lines specific to their machine**. Have them copy and run
**those exact two lines, one at a time**. They look like this (Apple Silicon):

```
(echo; echo 'eval "$(/opt/homebrew/bin/brew shellenv)"') >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

> Prefer the lines Homebrew actually printed in *their* Terminal over the example
> above — they're correct for their exact setup. (Intel Macs at `/usr/local`
> usually don't need this step.)

Then check it worked — have them run:

```
brew --version
```

If it prints a version, great. If it still says **"command not found: brew"**,
the PATH lines didn't take — have them **quit Terminal and reopen it** (Step A),
then run `brew --version` again.
→ Wait for a version number before moving on.

## Step D — Install Git

Now the easy part. Have them run (or, if you're in Claude Code, run it yourself):

```
brew install git
```

Let it finish, then confirm:

```
git --version
```

A version number means **Git is installed.** 🎉

## Step E — Back to Claude Code

Return to Claude Code and retry whatever it was doing when it said "git is
required" (e.g. open the folder again). It should work now.

---

## If something goes wrong

- **"command not found: brew"** after install → the Step C PATH lines weren't
  run, or Terminal needs reopening. Redo Step C, then reopen Terminal.
- **"command not found: git"** but `brew` works → they skipped Step D; run
  `brew install git`.
- **Password "isn't working"** → it IS being typed (just invisibly). Have them
  type it carefully and press Return; on a wrong password it asks again.
- **It asks to install "Command Line Developer Tools" in a popup** → click
  **Install** and accept; that's expected, let it finish, then continue.
- **They're on an Intel Mac** (`uname -m` → `x86_64`) → same steps; the Step C
  PATH lines are usually unnecessary (brew lands on the PATH already).

## Do NOT

- Don't assume they know what Terminal, Homebrew, PATH, or `sudo` are — say what
  each step does in one plain sentence.
- Don't give all the commands at once — one step, wait, next.
- Don't tell them their hidden-password typing "isn't working" — it is.
