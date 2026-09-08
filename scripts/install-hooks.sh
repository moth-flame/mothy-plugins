#!/usr/bin/env bash
#
# install-hooks.sh — point git at the version-controlled hooks in .githooks/.
#
# Uses `core.hooksPath` (not per-clone symlinks into .git/hooks) so the hooks
# stay in the repo, survive re-clone, and can't rot out of sync. Idempotent.
#
# WHY A REPO-AUTHORED INSTALLER, when plugins/mothy/hooks/arm-push-gate.mjs
# already arms this at session start: that hook only runs inside a Claude Code
# session with the Mothy plugin installed. A human clone, a CI checkout, or a
# session with the plugin disabled gets nothing. This script is the path that
# needs no plugin, and arm-push-gate.mjs itself looks for exactly this filename
# (its INSTALLERS list) when no tracked hooks dir is found.
#
# The gate it arms has TWO blocking legs — the gitleaks secret scan and the
# node manifest tests — each copied verbatim from the workflow that runs it.
# See .githooks/pre-push for why.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

DESIRED=".githooks"
CURRENT="$(git config --local --get core.hooksPath || true)"

if [ "$CURRENT" = "$DESIRED" ]; then
  echo "core.hooksPath already set to $DESIRED — nothing to do."
else
  git config core.hooksPath "$DESIRED"
  echo "set core.hooksPath -> $DESIRED"
fi

# Make sure the tracked hooks are executable. git preserves the bit, but a
# checkout on some filesystems (and every zip/tarball hand-off) loses it — and
# git then skips the hook SILENTLY, which is the failure mode the gate exists
# to make impossible.
chmod +x "$ROOT/$DESIRED"/* 2>/dev/null || true

# THE EXIT CODE IS NEVER THE VERDICT — re-probe the effective hook. An
# installer that exits 0 and installs nothing must warn, not report success.
EFFECTIVE="$(git rev-parse --git-path hooks/pre-push)"
if [ -x "$EFFECTIVE" ]; then
  echo "hooks installed. pre-push -> $EFFECTIVE"
else
  echo "WARNING: core.hooksPath is set but no executable pre-push hook is active at $EFFECTIVE" >&2
  echo "  Nothing will be checked before a push here." >&2
  exit 1
fi

# The secret-scan leg cannot run without gitleaks, and it FAILS CLOSED rather
# than passing — so say so at install time instead of at the first blocked push.
if ! command -v gitleaks >/dev/null 2>&1; then
  echo "NOTE: gitleaks is not on PATH. The pre-push secret scan will BLOCK every push" >&2
  echo "  until it is installed:  brew install gitleaks   (CI pins 8.30.1)" >&2
fi
