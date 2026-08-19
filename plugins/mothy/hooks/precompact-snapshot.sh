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

ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
OUT="$ROOT/.claude/precompact-state.md"
mkdir -p "$ROOT/.claude" 2>/dev/null || exit 0

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
