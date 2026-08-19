#!/usr/bin/env bash
# post-compaction-notice.sh — the other half of the loop.
#
# A snapshot nothing reads is worthless. Compaction does not start a new
# session, so there is no session-start moment afterwards to hook; the first
# thing that happens post-compaction is the user's next prompt. This fires
# there, ONCE, and tells the assistant the file exists.
#
# ONCE is the whole design. It prints only while the snapshot is newer than the
# marker it drops, so it costs a few tokens after a compaction and nothing on
# every other turn. A reminder that fires every turn gets ignored, which is the
# same as not having one.
#
# Contract: ALWAYS exits 0, prints nothing unless there is genuinely something
# new to say.
set -u

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
SNAP="$ROOT/.claude/precompact-state.md"
SEEN="$ROOT/.claude/.precompact-state.seen"

# Two files, two writers, on purpose: the snapshot opens with `>` and
# auto-park appends, and nothing guarantees they do not overlap.
REASON="$ROOT/.claude/precompact-reasoning.md"

[ -f "$SNAP" ] || [ -f "$REASON" ] || exit 0
if [ -f "$SEEN" ] \
   && [ ! "$SNAP" -nt "$SEEN" ] \
   && [ ! "$REASON" -nt "$SEEN" ]; then exit 0; fi

cat <<'MSG'
[automatic notice — housekeeping, not a user request]

A compaction just happened. Read these two files silently before your next
substantive action:

  .claude/precompact-state.md      objective state: branch, unpushed commits,
                                   uncommitted changes.
  .claude/precompact-reasoning.md  what was decided and why, what was tried and
                                   rejected, what is open, what is unverified.
                                   Model-written, so treat it as a lead.

A missing file, or one marked UNAVAILABLE or "Not written", means NOT RECORDED
— never "nothing was happening". Re-verify any conclusion that is load-bearing
for what you do next rather than assuming it.

DO NOT NARRATE ANY OF THIS.
Do not tell the user you read these files. Do not summarize them.
Do not report that they were empty or that there is nothing to resume.
Do not mention compaction.

The user did not ask for this and it is not part of their request. Answer only
what they actually asked. Surface something from these files ONLY when it
changes what you are about to do — and then say the thing itself, not where you
read it.
MSG

A compaction just happened. Before trusting anything you appear to remember,
read these two files — both captured immediately beforehand:

  .claude/precompact-state.md      objective state: branch, unpushed commits,
                                   uncommitted changes. Mechanical, always
                                   accurate, no reasoning.
  .claude/precompact-reasoning.md  what was decided and why, what was tried and
                                   rejected, what is open, what is unverified.
                                   Written by a model, so weaker than a
                                   deliberate park — treat it as a lead.

A missing file, or a section marked UNAVAILABLE, means "not recorded" — never
"nothing was happening". Re-verify any conclusion that is load-bearing for what
you do next rather than assuming it.
MSG

: > "$SEEN" 2>/dev/null || true
exit 0
