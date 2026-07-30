---
name: dev-setup
description: >-
  Get a brand-new (non-technical) Moth+Flame teammate's computer ready to use
  Claude Code — install the prerequisites Claude Code needs, chiefly **Git**.
  Covers **Windows** (winget or the Git for Windows installer) and **macOS**
  (Homebrew, then Git). Use this skill when:
    - Claude Code says **"git is required"**, **"git: command not found"**,
      **"install git"**, or won't open/clone a folder because Git is missing.
    - The user says "set up my computer for coding", "get me ready to use Claude
      Code", "I've never coded before", "install git", "what's Homebrew",
      "command not found: brew", "/dev-setup", or anything about installing the
      developer tools on their machine.
  Assume the user has NEVER opened a terminal and is not technical. Walk them one
  step at a time.
---

# Dev setup — get a computer ready for Claude Code (install Git)

You're getting a **non-technical** teammate's computer ready to use Claude Code.
Claude Code needs **Git**, and a fresh machine usually doesn't have it. You'll
walk them through it **conversationally, ONE step at a time, in plain language**
— no jargon, no dumping every step at once. After each step, wait for them to say
"done" (or paste what they see) before the next. Reassure liberally — this is
normal first-time setup, nothing is broken.

## §0 — Find out which computer they're on FIRST (do not skip)

**The steps are completely different on Windows and macOS, and giving someone the
wrong operating system's instructions is worse than giving none** — they'll paste
a command that cannot work and conclude they broke something. Never assume;
Moth+Flame is a mixed Mac/Windows team.

If you're running inside Claude Code (you have a terminal), detect it — don't make
them answer a question you can answer yourself:

1. Run `git --version`. **If it prints a version, Git is already installed — you're
   done.** Tell them and stop. This works identically on every OS, so it's always
   the right first move.
2. Still here? Identify the OS. Try `uname -s` — if it errors or isn't found,
   you're almost certainly on Windows (`cmd`/PowerShell have no `uname`). On
   PowerShell, `$env:OS` returns `Windows_NT`. `Darwin` from `uname -s` means macOS.
3. If you genuinely can't tell, just ask: *"Quick one — Windows or Mac?"*

If you're in Cowork or chat (no terminal) you can't run anything — **ask** which
one they're on, then give that track's steps as guidance.

Then follow **Track W (Windows)** or **Track M (macOS)** below. Do not mix them.

---

# Track W — Windows

Shorter than the Mac track: Windows has a built-in installer, so there's no
Homebrew-equivalent to set up first.

## W1 — Open Terminal

1. Press the **Windows key**.
2. Type **terminal** and press **Enter**. (On Windows 10 without Windows Terminal,
   type **powershell** instead and press **Enter**.)
3. A window with a text prompt opens. That's where commands go.
→ Tell them: "It looks bare — that's normal."

## W2 — Install Git

Have them copy this whole line, paste it in, and press **Enter**:

```
winget install --id Git.Git -e --source winget
```

What they'll see, and what to tell them:
- It may ask them to **agree to the source terms** the first time — accept.
- Windows may show a **User Account Control** popup asking to allow changes —
  click **Yes**. This is expected.
- It prints progress bars and takes a couple of minutes. ☕
→ Wait for them to say it finished.

**If `winget` isn't recognized** (older Windows 10, or it's been removed), fall
back to the installer — no terminal needed:
1. Go to **https://git-scm.com/download/win** — the download starts automatically.
2. Open the downloaded file and click **Next** through the installer. Every default
   is fine; they do not need to understand any of the options.
3. Click **Install**, then **Finish**.

## W3 — Close and reopen Terminal

**This step is the one people miss.** A terminal that was already open doesn't know
about newly installed programs, so `git` will still look missing until they reopen it.
Have them close the terminal window completely and open a new one (W1).

## W4 — Confirm it worked

```
git --version
```

A version number means **Git is installed.** 🎉

If it still says something like **"git is not recognized as the name of a cmdlet
or program"**, they most likely skipped W3 — have them close and reopen the
terminal and try once more.

Then go to **Step Z**.

---

# Track M — macOS

Claude Code needs **Git**; a fresh Mac usually has neither Git nor **Homebrew**
(the installer that gets Git).

If you're running inside Claude Code, you can do some of this yourself — don't
make the user do what you can do. Run `uname -m` (→ `arm64` = Apple Silicon
M-series; `x86_64` = Intel) and `brew --version`. If `brew` is missing, guide them
through **M2** (the Homebrew installer needs *their* Mac password typed into
*their* Terminal — you can't type it for them). Once `brew --version` works, **you**
can run `brew install git` yourself (Homebrew installs don't need a password).

## M1 — Open Terminal

1. Press **Command (⌘) + Space** to open Spotlight.
2. Type **terminal** and press **Return**.
3. A window with a text prompt opens.
→ Tell them: "It looks bare, that's normal. We'll paste in a few commands."

## M2 — Install Homebrew (the tool that installs Git)

Have them **copy this whole line**, paste it into Terminal, and press **Return**:

```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

What they'll see, and what to tell them:
- **It asks for your password.** This is their **Mac login password**. ⚠️ **The
  password is invisible as you type — no dots, no stars, nothing moves. That's
  normal and on purpose.** Just type it and press **Return**. (Aaron got stuck
  here — pre-empt it.)
- It may say it's installing the **Xcode Command Line Tools** first and take a few
  minutes. Let it run. ☕
- It prints a lot of text. When it stops and gives the prompt back, it's done.
→ Wait for them to say it finished.

## M3 — Add Homebrew to the PATH (Apple Silicon — the step everyone misses)

On **Apple Silicon Macs (M1/M2/M3)**, Homebrew installs somewhere Terminal can't
see yet, so typing `brew` gives **"command not found"** until you do this. At the
end of M2, Homebrew printed a box titled **"Next steps:"** with **two `eval`/`echo`
lines specific to their machine**. Have them run **those exact two lines, one at a
time**. They look like this:

```
(echo; echo 'eval "$(/opt/homebrew/bin/brew shellenv)"') >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

> Prefer the lines Homebrew actually printed in *their* Terminal over the example
> above — they're correct for their exact setup. (Intel Macs at `/usr/local`
> usually don't need this step.)

Then confirm:

```
brew --version
```

If it still says **"command not found: brew"**, have them **quit Terminal and
reopen it** (M1), then try again.
→ Wait for a version number before moving on.

## M4 — Install Git

```
brew install git
```

Then confirm:

```
git --version
```

A version number means **Git is installed.** 🎉

---

# Step Z — Back to Claude Code (both tracks)

Return to Claude Code and retry whatever it was doing when it said "git is
required" (e.g. open the folder again). It should work now.

## If something goes wrong

**Windows**
- **"git is not recognized…"** → the terminal was open before Git was installed.
  Close it, open a new one (W1), try again. This is by far the most common one.
- **"winget is not recognized…"** → use the git-scm.com installer fallback in W2.
- **A popup asks to allow changes** → that's User Account Control; click **Yes**.

**macOS**
- **"command not found: brew"** after install → the M3 PATH lines weren't run, or
  Terminal needs reopening. Redo M3, then reopen Terminal.
- **"command not found: git"** but `brew` works → they skipped M4; run
  `brew install git`.
- **Password "isn't working"** → it IS being typed (just invisibly). Have them type
  it carefully and press Return; on a wrong password it asks again.
- **A popup offers "Command Line Developer Tools"** → click **Install**, let it
  finish, then continue.
- **Intel Mac** (`uname -m` → `x86_64`) → same steps; M3 is usually unnecessary.

## Do NOT

- **Don't give macOS steps to a Windows user or vice versa.** Establish the OS in
  §0 before anything else.
- Don't assume they know what a terminal, Homebrew, PATH, winget, or `sudo` is —
  say what each step does in one plain sentence.
- Don't give all the commands at once — one step, wait, next.
- Don't tell a Mac user their hidden-password typing "isn't working" — it is.
