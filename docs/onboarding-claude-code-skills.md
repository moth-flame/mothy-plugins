# Getting the Moth+Flame skills working in Claude Code

**Who this is for:** anyone at Moth+Flame who wants `/article`, `/plan`, `/deck` and
the rest of our skills to work in the **Code** tab of Claude Desktop.

**How long:** about five minutes, once per computer. You never have to do it again on
that machine.

**You do not need to be technical.** Every step is copy, paste, and click.

---

## Why this is needed

Our skills reach you two different ways, and only one of them is automatic.

- **In Chat**, they arrive from your Claude account. Nothing to set up — they just appear.
- **In Code**, Claude has to download them onto your actual computer from our private
  GitHub repository. Your computer needs to prove it's allowed to read that repository.

Until it can, the Code tab quietly has no skills. Nothing warns you — they're simply
missing, which is why this catches people out.

That's all this is: **signing your computer in to GitHub, once.**

It matters twice over. The same sign-in is what lets your skills **keep updating**
afterwards. A machine that can't authenticate silently freezes on whatever version it
first received — we found one stuck ten releases behind, with nothing on screen to say
so.

You need to already be a member of the Moth+Flame GitHub organization. If you're not
sure, ask Rich before you start — the steps below won't work without it.

---

## Windows

### Step 1 — Open Git Bash

Click **Start**, type `Git Bash`, and open it. A small black window appears.

**Don't see it?** Git isn't installed. Download it from **https://git-scm.com/download/win**,
run the installer accepting every default, then **restart Claude Desktop** and come back here.

### Step 2 — Sign in

Copy this line, paste it into the black window, and press Enter:

```
git ls-remote https://github.com/moth-flame/mothy-plugins.git
```

> **Paste in Git Bash is right-click, not Ctrl+V.**

A **GitHub sign-in window should open in your browser.** Sign in with the account that's
on our Moth+Flame organization. If it asks you to authorize "Git Credential Manager,"
say yes.

**What success looks like:** a wall of long letter-and-number codes fills the window.
That's it — you're signed in permanently.

**If it just sits there doing nothing for more than a minute**, press `Ctrl+C` and skip
to *If the simple way didn't work* below.

### Step 3 — Restart Claude Desktop properly

Closing the window is not enough — the app keeps running in the background.

Find the Claude icon in your **system tray** (bottom-right of your screen, possibly
hidden behind the small `^` arrow), **right-click it, and choose Quit**. Then open
Claude Desktop again.

Now go to **Step 4 — Check it worked**.

---

## Mac

### Step 1 — Open Terminal

Press `Cmd + Space`, type `Terminal`, press Enter. A window appears.

### Step 2 — Sign in

Copy this line, paste it into the Terminal window, and press Enter:

```
git ls-remote https://github.com/moth-flame/mothy-plugins.git
```

Three things can happen:

- **A wall of long letter-and-number codes appears.** You're already signed in. Nothing
  more to do — go to Step 3.
- **A box pops up asking to install developer tools.** Click Install, wait for it to
  finish, then run the line again.
- **It asks you for a Username and Password.** Press `Ctrl+C` to stop, and go to
  *If the simple way didn't work* below. Don't type your GitHub password — GitHub
  stopped accepting passwords here, so it won't work.

### Step 3 — Restart Claude Desktop properly

Quit it fully with `Cmd + Q` — closing the window isn't enough. Then reopen it.

---

## Step 4 — Check it worked

1. Open Claude Desktop and click the **Code** tab.
2. Start a new session.
3. Near the prompt box, make sure **Environment** is set to **Local**.
4. Type a single `/` in the prompt box.

You should now see **article**, **plan**, **deck** and others in the list.

**If you see them, you're done.** Nothing else to do, ever, on this computer — and
they'll stay up to date on their own from here.

---

## If the simple way didn't work

This installs a small official GitHub tool that handles the sign-in for you. Still no
technical knowledge required.

**Windows** — open Git Bash and paste:

```
winget install --id GitHub.cli
```

**Mac** — download and run the installer from **https://cli.github.com**.

Then **close and reopen** the black window / Terminal, paste this, and press Enter:

```
gh auth login
```

Answer the questions with the arrow keys and Enter:

| It asks | Choose |
|---|---|
| What account do you want to log into? | **GitHub.com** |
| What is your preferred protocol? | **HTTPS** |
| Authenticate Git with your GitHub credentials? | **Yes** — this one matters, don't skip it |
| How would you like to authenticate? | **Login with a web browser** |

It shows you a short code, then opens your browser. Paste the code, sign in, approve.

Now go back and do **Step 3** (restart Claude Desktop properly) and **Step 4**.

---

## Troubleshooting

| What you see | What it means | What to do |
|---|---|---|
| The command sits there for minutes with no output | It's silently waiting for a sign-in that can't appear | Press `Ctrl+C`, use *If the simple way didn't work* |
| `Repository not found` or a `404` | Your GitHub account isn't on our organization, or you signed in with a personal account | Message Rich with the GitHub username you used |
| It asks for a Username and Password | No sign-in helper is set up on this machine | Press `Ctrl+C`, use *If the simple way didn't work* |
| `claude: command not found` | Completely normal | Ignore it. That's a separate terminal tool you don't need |
| Skills still missing after all of this | Something environment-specific | Message Rich — include what the command printed |

**Two things that quietly waste time:**

- **Closing the Claude window is not quitting it.** On Windows quit from the system
  tray; on Mac use `Cmd + Q`. The skills only load when the app actually starts fresh.
- **Environment must be Local.** A Cloud session gets its skills a completely different
  way, and none of the steps above apply to it.

---

## For whoever is helping someone through this

The failure is always the same: `extraKnownMarketplaces` and `enabledPlugins` are pushed
org-wide from the Claude admin console, so every machine is *told* to install the
plugin — but the marketplace lives in a **private** repository, and managed settings
deliver configuration, never credentials. The clone fails, silently, and Claude Code
carries on without the skills.

`git ls-remote` against the marketplace repo is the whole diagnostic. It hangs when a
credential prompt has nowhere to display, 404s when the account lacks access, and
returns refs when everything is fine.

Note that a session running *inside* Claude cannot complete this — an interactive
sign-in has no window there. It has to be a terminal the person opened themselves.
`/status` and `claude doctor` are CLI-only and do **not** exist in Claude Desktop; to
check what a Desktop machine actually has, read `~/.claude/plugins/known_marketplaces.json`
and `~/.claude/plugins/installed_plugins.json`. An entry there with `"scope": "managed"`
is positive proof the admin-console push reached that machine.

The same credential gap also breaks **updates**, not just the first install. Background
plugin updates run with credential helpers disabled and fall back to a re-clone using the
person's own credentials; against a private repo with none configured, that fails
silently and the machine stays on its original version forever. A machine with the
sign-in done updates normally. This is why the step is worth insisting on even for
someone whose skills appear to be working.
