---
name: proceed
description: Park work before a compaction, context switch, or handoff — or resume it cleanly afterwards. Runs in exactly ONE of two modes, chosen from the user's words: PARK (make state durable on disk, then STOP) or RESUME (pick the work back up from the durable record, not from memory). Never both in one invocation. Use when the user says "/proceed", "prepare for compaction", "write state to disk", "we're about to compact", "prepare to switch accounts", "keep going", "pick up where you left off", or "continue".
metadata: { "openclaw": { "emoji": "▶️" } }
---

# proceed — park before a compaction, resume cleanly after one

Repo-agnostic. Works in any project; every step degrades to a no-op when the project
lacks the thing it operates on.

## Why this exists

You pay for conversation context on **every message**, not once — the whole history is
re-sent each turn. A conversation at 800k tokens costs roughly 4× per message what the
same work cost at 200k. Compacting resets that.

People avoid compacting because it loses things. It does, in a specific way: **compaction
keeps conclusions and drops the evidence underneath them.** The summary stays accurate
about what was *said* while losing your ability to *check* it, so a wrong conclusion can
survive a compaction wearing exactly the same confidence as a right one.

This skill removes the reason to avoid it. Park first, and nothing important is riding on
the summary.

---

## §0 — Pick the mode FIRST, before doing anything else

**No invocation runs both halves.** Exactly one of §1 or §2 runs, decided by the user's
words — not by reading the sections in order.

| The user said | Mode | Then |
|---|---|---|
| "prepare for compaction", "write state to disk", "we're about to compact", "prepare to switch accounts", "ready to switch?" | **PARK** (§1) | **STOP.** Report ready. Wait. |
| "/proceed", "keep going", "pick up where you left off", "continue", "we had to switch accounts" (after) | **RESUME** (§2) | Continue the work per §2.6 |

**Say which mode you picked, in one line, before acting.** "Mode: PARK — durability then
stop." An unstated mode is how the wrong one gets run.

**When the words point both ways, PARK wins.** "Prepare for compaction and keep going" is
ambiguous, and the two errors are not symmetric: parking when you could have continued
costs one round-trip; continuing when you should have parked destroys the in-flight work
AND the clean boundary that was the point. Park, say why, and let the user say "go."

**A compaction is a boundary you stop at, not a pause you work through.** Nothing started
in the minutes before one survives in usable form — and in the resulting summary a
half-finished job is indistinguishable from a finished one, which is worse than never
having started it.

---

## §1 — Make state durable, then STOP (PARK mode)

Assume the context you are holding will be gone shortly. Anything that exists only in the
conversation is already lost.

**Nothing new starts in this section.** No sub-agents, no background commands, no builds,
no browser sessions, no long test runs — with one exception: a command that is *itself*
part of making state durable, such as the project's test gate, so you know whether a
commit is allowed to land. If you catch yourself kicking something off "while the notes
are being written," that is precisely the failure this rule exists to stop. Start it after
the user says go.

1. **Check what is uncommitted.** `git status` first, before anything else. Know the real
   state rather than the remembered one.

2. **Land what is finished and green.** If the work is complete and the project's tests
   pass, commit it. **Ask before pushing** unless the user has already said to push —
   different teams have different rules and this skill does not get to invent one.

3. **Write down what is NOT finished — in the project, not in the reply.** Use whatever
   the project already uses for working notes (`docs/`, a drafts folder, a scratch
   directory, an issue). Record: what landed, the evidence behind it, what is still open,
   and — most valuable — **the reasoning that would be expensive to re-derive.**

   **Rejected alternatives and why they were rejected belong here.** Without them the next
   session re-explores them from scratch and can ship the option you already ruled out.
   This is the part no automated snapshot can produce for you.

4. **Retire a stale note rather than leaving it.** A note saying "uncommitted, resume
   here" after the work has landed is worse than no note at all — overwrite it with a
   pointer to whatever is now authoritative.

5. **Keep the todo list truthful**, including things deliberately *not* done and why. An
   item you were asked for and have not started is `pending`, named as such — never folded
   into a neighbouring "done."

### The stop is the deliverable

When 1–5 are done, **stop and hand back.** Report three things: what landed, what is
written down and where, and what is still owed. Then wait. The user decides when to
resume — your own judgment that there is time is not that decision.

Do NOT read on into §2. It is the other mode's section; arriving there by scrolling is the
exact defect §0 exists to prevent.

---

## §2 — Resume from the record, not from memory (RESUME mode)

1. **Read the durable record first** — the notes, then `git log`, then whatever the
   project keeps as its decision history. Trust the files over recollection.

2. **Check whether the work already landed.** If the commit exists, the task is done —
   report it and move on rather than redoing it.

3. **Re-run anything that died mid-flight.** A background job killed by a session ending
   produced nothing durable. Its task is NOT done, however it was described.

4. **Verify anything still pending confirmation.** A deploy confirmed only by the fact
   that you wrote the config is not confirmed. Check the symptom the change was meant to
   fix, against a stated baseline.

5. **Distrust your own summaries.** A summary of prior work is a claim, not evidence. If a
   conclusion is load-bearing for what you do next, re-verify it cheaply — read the file,
   run the test, tail the log. This is the single highest-value habit in the whole skill,
   because it is the exact thing compaction degrades.

### §2.6 — Then keep going. Autonomy is the default.

Resuming is not "report and await instructions." Once §2.1–§2.5 have re-established what
is true, work the known backlog — the notes' open items, the todo list, the project's
issue trail — until it is done or genuinely blocked. The user already gave the intent;
asking them to re-issue it per item is the failure this section removes.

**Decide every reversible call yourself.** Anything you could undo — revert a commit, flip
a setting back, re-run a job, restore from a source that still holds the data — is yours.
Make it, note the decision and a one-line rationale in your report, and move on.

**Escalate only the irreversible.** Destroying the only copy of something, a production
cutover with no rollback, deleting an account or credential. If a rollback exists and is
cheap, it is not this category.

Two things this does **not** relax:

- **Gates stay hard.** Tests, review requirements, confirmation codes. A confirmation code
  is a control, not a decision: request it, never route around it. Autonomy is about who
  chooses, never about which checks run.
- **PARK mode is untouched.** §1's "nothing new starts" binds absolutely. Reading this
  section as licence to launch work *while parking* re-introduces the exact defect §0
  exists to stop.

**When blocked, do everything that is not blocked first.** Finish every independent item,
then surface the block in one message with the assumption you would proceed under. Reserve
a full stop for cases where proceeding under any assumption would be unsafe or would waste
the work if wrong.

**Report at the end, not per step.** One combined summary: what landed, the reversible
calls you made and why, what is still open, and anything genuinely waiting on the user.

---

## §3 — Using this with auto-compaction

Auto-compaction is the safety net; it fires on a size threshold at whatever moment you
cross it, which may be mid-thought. Parking is the deliberate version. Use both:

- **Set the auto-compact window well below the model's maximum.** The maximum is a
  ceiling, not a target. Letting a conversation run to the limit means paying top rates for
  its entire second half.
- **Park at seams** — after a piece of work lands, after a decision is made, before
  switching topic. Little is in flight, so little is at risk.
- **Don't park mid-debug.** Three steps into chasing something is the worst moment. Get to
  the end of the thought, then park.

Done this way auto-compaction rarely fires as a surprise, because you have already
compacted deliberately before reaching the threshold.

---

## §4 — Anti-patterns

- **Running PARK and RESUME in one invocation.** They are alternatives, not a sequence.
- **Launching anything new in PARK mode** — an agent, a build, a browser session, a live
  test. This has happened: asked to prepare for a switch, the notes were written correctly
  *and* a live production test was dispatched at the same time.
- **Stopping after a resume to ask what to do next**, or asking permission for a
  reversible call the user's stated intent already covers.
- **The mirror error:** treating §2.6 as licence to walk through an irreversible door, or
  to skip a gate, because "autonomous."
- **Parking silently** — finishing §1 without naming the mode or listing what is still
  owed. The next session then cannot tell "not started" from "done."
- **Continuing substantive work while the project holds uncommitted, unrecorded state.**
- **Treating a background-task notification as user approval.** It is not user input.
