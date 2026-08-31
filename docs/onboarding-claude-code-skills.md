# Getting the Mothy skills in Claude Code

**You should not need this page. Ask Claude instead.**

In Claude chat or Cowork, say:

> How do I update the Mothy skills in Claude Code?

Claude will walk you through it one command at a time, read your terminal output back, and tell you what to do next. That is the supported path — it handles the error messages this page cannot anticipate, and it does not ask you to interpret anything.

This page exists for the two cases where that is not available to you.

---

## If you just want the commands

Open Terminal (Mac: Applications → Utilities → Terminal) or Git Bash (Windows). Paste these **in this order**:

```
claude plugin marketplace update mothy-marketplace
claude plugin update mothy@mothy-marketplace
```

Then **quit Claude completely and reopen it.**

If the second line says the plugin is in *managed scope*, re-run just that line as:

```
claude plugin update mothy@mothy-marketplace --scope managed
```

That is the whole update procedure.

## First time only

```
claude plugin marketplace add moth-flame/mothy-plugins
claude plugin install mothy@mothy-marketplace
```

Quit and reopen Claude. The `mothy-plugins` repository is public, so no GitHub sign-in is needed.

**If `marketplace add` fails with an authentication or permission error**, the repo may have been made private again:

```
gh auth login
```

Choose **GitHub.com → HTTPS → yes to authenticate git → Login with a web browser**, and sign in with your **@mothandflamevr.com** account. If `gh` is not found on a Mac, install it with `brew install gh` first. Then re-run the two lines above.

---

## Two things that will mislead you

**The order of the two update commands is the entire fix.** Claude Code never refreshes its copy of the plugin catalog on its own, so running `claude plugin update` alone reinstalls the old version and reports success. This is an open Claude Code bug, not a Moth+Flame misconfiguration.

**The Plugins panel in Settings shows the catalog version, not your installed version.** It will happily display a version you do not have. Do not use it to check whether the update worked — type `/` in Claude Code and look for `/article`, `/deck`, `/plan`.

## If something goes wrong

Paste the terminal output into Claude chat and ask what it means. Do not delete anything under `~/.claude` by hand.
