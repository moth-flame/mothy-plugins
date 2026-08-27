---
name: mc
description: Surface every open decision that is the user's to make as AskUserQuestion multiple-choice widgets, recommendation first, one decision per question. Always-on for blocking decisions — nobody has to type /mc. Also use when the user says "/mc", "ask me multiple choice", "give me options", "what do you need from me", "what's blocking you", or "ask me the questions". Never bury a question in prose.
metadata: { "openclaw": { "emoji": "🗳️" } }
---

# mc — ask for a decision the way it can actually be answered

## Why this exists

The person you are working with is usually reading a feed that keeps scrolling: agent notifications, gate output, coord
traffic, status lines. **A question written in prose scrolls up and is gone**, and
the honest state — *I am stopped, waiting on you* — becomes invisible. They answer
a question they never saw by not answering it, and the work sits.

A question widget is a stop sign that does not scroll past.

`/mc` means: *stop, collect everything you are actually blocked on, and put it in
front of me as choices I can click.*

## What to do when invoked

1. **Sweep for real blocks.** Walk the todo list, the coord threads, the open
   findings, and anything you deferred with "yours to call". Do not invent
   decisions to fill the widget.
2. **Filter hard** — see "What does NOT belong" below. Most of what feels like a
   question is a two-way door you should already have decided.
3. **Ask up to 4.** One decision per question. Two questions beat one compound
   option list, and four is the ceiling `AskUserQuestion` accepts.
4. **Act on the answers.** Then report what moved.

If the sweep turns up nothing, say so in one line — *"nothing blocking; here's
what's running"* — and do not manufacture a question.

## Rules for the question itself

- **Recommendation FIRST, marked `(Recommended)`.** Having an opinion is the job.
  An unranked menu pushes the analysis back onto them, which is the thing asking
  was supposed to save.
- **Carry the context INTO the question.** One sentence of what happened and why
  the choice exists, restated inside the question text — never a reference to
  something above it ("as noted", "per the finding", "given the above"). Assume
  they have NOT read the paragraph above the widget. They probably have not. If the
  question is unreadable on its own, it is unreadable.
- **Each option states its CONSEQUENCE, not its name.** "Hold at dev" means
  nothing. "I push to dev, you click through it, then I ship to prod on your word
  — costs you ~2 minutes" is a decision they can make in one read.
- **Name the real trade honestly, including against your own recommendation.** If
  the fast option is genuinely fine, say so in its description rather than
  strawmanning it to make your pick look better.
- **Numbers, not adjectives.** "15 actions and 4 stakeholders" beats "some
  downstream data". If a consequence has a measured size, it goes in the option.
- **Say what is reversible.** "Clears on the next run" and "no rollback" are the
  two facts that most change an answer, and they are cheap to state.

## What does NOT belong in a widget

- **Two-way doors their stated intent already covers.** A revert, a flag flip, a
  re-run undoes it → decide it, record the one-line rationale in the report, keep
  going. Asking permission per item is how autonomy dies.
- **Anything you could settle by measuring.** Go measure it. A question you asked
  instead of running a command wastes the one channel that is guaranteed to
  interrupt them.
- **Status.** "Should I proceed?", "is this right?", "ready for me to continue?"
  are not decisions. Report status in prose; reserve the widget for choices.
- **A hard gate.** Red-green TDD, the pre-push suite, `--no-verify`, a
  `confirmation_code` — those are controls, not decisions. Request a code; never
  offer bypassing one as an option.

**The test is not "is this important."** It is **"would I be stopping anyway?"**
If yes, that stop belongs in a widget rather than in prose. If no, do not
manufacture a stop.

## Standing effect

**Always-on.** Treat this as the default format for every blocking decision in
the session, whether or not anyone typed `/mc`. A SessionStart hook injects the
same policy; `/mc` is the explicit sweep ("collect everything you are blocked
on right now"), not the opt-in that turns widgets on.

This does not relax any gate, and it does not make you more likely to stop. It
changes only *how* a stop is surfaced. Kill switch `MOTHY_MC_ALWAYS_ON`
(off-values `0|off|false|no`) disables the SessionStart inject; the skill
still works when invoked.
