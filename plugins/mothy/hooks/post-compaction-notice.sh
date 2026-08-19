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

[ -f "$SNAP" ] || exit 0
if [ -f "$SEEN" ] && [ ! "$SNAP" -nt "$SEEN" ]; then exit 0; fi

cat <<'MSG'
A compaction just happened. Before trusting anything you appear to remember:
read .claude/precompact-state.md — it holds the objective state (commits,
unpushed work, uncommitted changes) captured immediately beforehand. It does
NOT contain reasoning or rejected approaches; an empty section means "not
recorded", never "nothing was happening". Re-verify any conclusion that is
load-bearing for what you do next rather than assuming it.
MSG

: > "$SEEN" 2>/dev/null || true
exit 0
