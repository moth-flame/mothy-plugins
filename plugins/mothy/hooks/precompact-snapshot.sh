#!/usr/bin/env bash
# precompact-snapshot.sh — runs automatically just before a compaction.
#
# WHAT IT CAN AND CANNOT DO. A hook is a shell command, not the assistant, so it
# cannot write down your reasoning, your rejected approaches, or why an approach
# was chosen. Only the assistant can do that, and only if asked (say "prepare
# for compaction"). What a script CAN do with certainty is capture the objective
# state — what is committed, what is not, what is unpushed — so that at minimum
# those facts never depend on the summary.
#
# Treat this as the floor, not a substitute for parking.
#
# Contract: ALWAYS exits 0. A hook that can fail a compaction is worse than no
# hook, and blocking a compaction because context is full would stall the
# session at exactly the moment it cannot afford it.
set -u

# WHERE TO WRITE. The hook payload carries `cwd` — the project Claude Code is
# actually working in — and that is the only source here that KNOWS rather than
# infers. `git rev-parse --show-toplevel` does not fail when it is wrong: it
# returns whatever repo the hook happens to be standing in, which on Desktop
# was the plugin's own marketplace checkout (2026-08-19, measured). The file
# landed there, invisible to the user, and would have been erased by the next
# plugin update.
#
# Order: explicit env, then the payload, then a guess.
#
# `read -t` is a bash BUILTIN. `timeout` is GNU coreutils and does NOT exist on
# macOS, where all of this actually runs — using it would have made this whole
# fix silently inert on the only platform in play, failing back to the guess it
# was written to replace, with nothing to say so.
PAYLOAD=""
if [ ! -t 0 ]; then IFS= read -r -d '' -t 2 PAYLOAD || true; fi
HOOK_CWD="$(printf '%s' "$PAYLOAD" \
  | sed -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"

# Stamp WHICH session compacted. The post-compaction notice needs it: park
# files outlive the session that wrote them, so "these files are new" cannot
# distinguish "this session just compacted" from "some session once did".
SESSION_ID="$(printf '%s' "$PAYLOAD" \
  | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"

ROOT="${CLAUDE_PROJECT_DIR:-}"
[ -n "$ROOT" ] || ROOT="$HOOK_CWD"
[ -n "$ROOT" ] || ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Never write inside our own installation, whatever produced the answer above.
# A park file there is invisible to the user AND destroyed by the next update —
# strictly worse than not writing one, because the project then looks like the
# hook never ran. Falling back to pwd can be wrong; it cannot be silently
# swallowed by a directory the user never opens.
case "${CLAUDE_PLUGIN_ROOT:-}" in
  "") ;;
  *) case "$ROOT" in "$CLAUDE_PLUGIN_ROOT"*) ROOT="$(pwd)" ;; esac ;;
esac

OUT="$ROOT/.claude/precompact-state.md"
SESSION_FILE="$ROOT/.claude/.precompact-session"
mkdir -p "$ROOT/.claude" 2>/dev/null || exit 0
printf '%s' "$SESSION_ID" > "$SESSION_FILE" 2>/dev/null || true

{
  echo "# Pre-compaction snapshot"
  echo
  echo "Written automatically by the mothy plugin's PreCompact hook."
  echo "MECHANICAL FACTS ONLY — no reasoning, no rejected alternatives, no why."
  echo "Those survive only if the assistant was asked to park. **Absence here is"
  echo "not evidence** that nothing was in progress."
  echo
  echo "- generated: $(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo unknown)"
  echo "- project: $ROOT"
  echo

  echo "## Git position"
  echo '```'
  git -C "$ROOT" log --oneline -1 2>/dev/null || echo "(not a git repository)"
  echo "branch: $(git -C "$ROOT" branch --show-current 2>/dev/null || echo '?')"
  echo '```'
  echo

  echo "## Unpushed commits"
  echo '```'
  git -C "$ROOT" log --oneline @{u}..HEAD 2>/dev/null || echo "(no upstream, or none)"
  echo '```'
  echo

  echo "## Uncommitted TRACKED changes"
  echo "Untracked files are excluded on purpose — in a busy project they bury the signal."
  echo '```'
  git -C "$ROOT" status --short --untracked-files=no 2>/dev/null || echo "(unavailable)"
  echo '```'
  echo

  echo "## Recent commits (last 20)"
  echo '```'
  git -C "$ROOT" log --oneline -20 2>/dev/null || echo "(unavailable)"
  echo '```'
} > "$OUT" 2>/dev/null

exit 0
