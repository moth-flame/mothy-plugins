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

# WHOSE compaction was it? Park files outlive their session, so a later
# session opened in the same folder would otherwise be told it just came out of
# a compaction it had no part in — measured 2026-08-19, and it then reported a
# stranger's state at the user on their first turn.
PAYLOAD=""
if [ ! -t 0 ]; then IFS= read -r -d '' -t 2 PAYLOAD || true; fi
NOW_SESSION="$(printf '%s' "$PAYLOAD" \
  | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
PARK_SESSION="$(cat "$ROOT/.claude/.precompact-session" 2>/dev/null || true)"

# Both known and different: not ours, say nothing.
#
# When either is UNKNOWN, fall through to the mtime rule rather than going
# quiet. This is the rare case where this repo's fail-closed instinct points
# the wrong way: a missed notice after a REAL compaction loses the whole
# feature, while a spurious one is noise. Wrong in the recoverable direction.
if [ -n "$NOW_SESSION" ] && [ -n "$PARK_SESSION" ] \
   && [ "$NOW_SESSION" != "$PARK_SESSION" ]; then exit 0; fi

[ -f "$SNAP" ] || [ -f "$REASON" ] || exit 0

# Nothing captured by EITHER hook ⇒ say nothing at all. A file that exists but
# declares itself empty is not a reason to spend the user's next turn.
#
# An ABSENT marker counts as present: a park file written by an older plugin
# has no marker, and going quiet on it would silently drop the notice for
# everyone mid-upgrade. Unknown falls toward notifying, as with the session id.
signal_of() {
  [ -f "$1" ] || { echo none; return; }
  case "$(head -1 "$1" 2>/dev/null)" in
    *"park-signal: present"*) echo present ;;
    *"park-signal: none"*)    echo none ;;
    *)                        echo present ;;
  esac
}
if [ "$(signal_of "$SNAP")" = none ] && [ "$(signal_of "$REASON")" = none ]; then exit 0; fi
if [ -f "$SEEN" ] \
   && [ ! "$SNAP" -nt "$SEEN" ] \
   && [ ! "$REASON" -nt "$SEEN" ]; then exit 0; fi

# THE FACTS, INLINE. Not paths, not a task.
#
# Four releases were spent trying to stop the assistant narrating this. Every
# one treated it as a wording problem. It was not: the notice handed over two
# file paths and told the model to read them, so it made tool calls and
# reported what it found. That IS reading files. The narration was compliance,
# not defiance.
#
# So nothing here names a file, and nothing asks for an action. Bounded: a
# compaction is not the moment to paste a thousand-line diff into context.
BRANCH="$(git -C "$ROOT" branch --show-current 2>/dev/null)"
DIRTY="$(git -C "$ROOT" status --short --untracked-files=no 2>/dev/null | head -20)"
AHEAD="$(git -C "$ROOT" log --oneline @{u}..HEAD 2>/dev/null | head -10)"
WHY=""
if [ -f "$REASON" ] && [ "$(signal_of "$REASON")" = present ]; then
  WHY="$(sed -e '/^<!--/d' -e '/^## What was going on/d' "$REASON" 2>/dev/null | head -60)"
fi

{
  echo "<compaction-context>"
  echo "The conversation was just compacted. The summary kept conclusions and"
  echo "dropped the evidence under them. What follows was captured immediately"
  echo "beforehand and is the part a summary loses."
  echo
  [ -n "$BRANCH" ] && echo "branch: $BRANCH"
  if [ -n "$AHEAD" ]; then echo "unpushed:"; printf '%s\n' "$AHEAD"; fi
  if [ -n "$DIRTY" ]; then echo "uncommitted:"; printf '%s\n' "$DIRTY"; fi
  if [ -n "$WHY" ]; then echo; printf '%s\n' "$WHY"; fi
  echo
  echo "This is background context, not a request, and not something the user"
  echo "said. They cannot see it. Answer only what they actually asked."
  echo "Never mention this block, the compaction, or how you came to know any"
  echo "of it. Use a fact from here only where it changes what you do, and then"
  echo "state the fact alone. Anything absent above is NOT RECORDED rather than"
  echo "known-empty, so re-verify rather than assuming."
  echo "</compaction-context>"
}

: > "$SEEN" 2>/dev/null || true
exit 0
