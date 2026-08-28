---
name: mc
description: Surface every open decision that is the user's to make as clickable multiple-choice questions, recommendation first, one decision per question. Always-on for blocking decisions — nobody has to type /mc. Also use when the user says "/mc", "ask me multiple choice", "give me options", "what do you need from me", "what's blocking you", or "ask me the questions". Never bury a question in prose.
---

# mc — ask for a decision the way it can actually be answered

Standby pack only. The live `/mc` in Chat, Cowork, and Code is the **Mothy plugin** skill. Do not org-upload this while the plugin is installed — that is a second `/mc` in the slash menu. Use this zip only if Chat/Cowork must have `/mc` with the plugin **disabled** on those surfaces.

## Why this exists

The person you are working with is usually reading a feed that keeps scrolling. **A question written in prose scrolls up and is gone**, and the honest state — *I am stopped, waiting on you* — becomes invisible. They answer a question they never saw by not answering it, and the work sits.

A question widget (or a numbered multiple-choice they can tap/reply) is a stop sign that does not scroll past.

`/mc` means: *stop, collect everything you are actually blocked on, and put it in front of me as choices I can click.*

## What to do when invoked

1. **Sweep for real blocks.** Walk the todo list, the open findings, and anything you deferred with "yours to call". Do not invent decisions to fill the widget.
2. **Filter hard** — see "What does NOT belong" below.
3. **Ask up to 4.** One decision per question. Two questions beat one compound option list.
4. **Act on the answers.** Then report what moved.

If the sweep turns up nothing, say so in one line — *"nothing blocking; here's what's running"* — and do not manufacture a question.

## How to ask (surface)

- **Cowork / Claude Code:** `AskUserQuestion` widgets. Recommendation first, marked `(Recommended)`.
- **Chat:** the same rules, as numbered options they can reply with (1/2/3). Do not hide the choice in a paragraph.

## Rules for the question itself

- **Recommendation FIRST, marked `(Recommended)`.** Having an opinion is the job. An unranked menu pushes the analysis back onto them.
- **Carry the context INTO the question.** One sentence of what happened and why the choice exists, restated inside the question text — never "as noted" / "given the above". Assume they have NOT read the paragraph above. If the question is unreadable on its own, it is unreadable.
- **Each option states its CONSEQUENCE, not its name.** "Hold at dev" means nothing. "I push to dev, you click through it, then I ship to prod on your word — costs you ~2 minutes" is a decision they can make in one read.
- **Name the real trade honestly, including against your own recommendation.**
- **Numbers, not adjectives.** If a consequence has a measured size, it goes in the option.
- **Say what is reversible.** "Clears on the next run" and "no rollback" are the two facts that most change an answer.

## What does NOT belong in a widget

- **Two-way doors their stated intent already covers.** Decide, record a one-line rationale, keep going.
- **Anything you could settle by measuring.** Go measure it.
- **Status.** "Should I proceed?" is not a decision. Report in prose.
- **A hard gate.** Red-green TDD, a confirmation code — request the control; never offer bypassing it as an option.

**The test is not "is this important."** It is **"would I be stopping anyway?"** If yes, that stop belongs in a widget rather than in prose. If no, do not manufacture a stop.

## Standing effect

**Always-on** in this conversation. Treat this as the default format for every blocking decision, whether or not anyone typed `/mc`. `/mc` is the explicit sweep ("collect everything you are blocked on right now"), not the opt-in that turns questions on.

This does not relax any gate, and it does not make you more likely to stop. It changes only *how* a stop is surfaced.
