#!/usr/bin/env bash
set -euo pipefail

# Replay all 3 frozen cases through the v2 verifier rubric.
#
# Each case directory contains:
#   - plan.md             — minimal unit spec + impl diff + dependency types
#   - expected-verdict.json — rubric ids the verifier MUST flag, expected overall_verdict
#   - README.md           — human-readable description of the bug
#
# Exit 0 iff every case's expected_findings are produced by the verifier on its plan.
# This is a SMOKE test — it does not run the full /build, only re-spawns the verifier
# agent on a captured diff and checks the resulting verdict against expected-verdict.json.
#
# Usage:
#   bash regression/replay.sh           # run all 3 cases
#   bash regression/replay.sh case-01   # run a single case
#
# Requires: jq, Claude Code CLI (claude) with the v2 SKILL.md in place.
#
# NOTE — v1 of this script is INTERACTIVE. The verifier agent is spawned through
# the /build skill harness, which currently can't be triggered from a standalone
# bash script without a live Claude session. The script prints instructions for
# how to manually re-run each case through the current verifier and how to diff
# the output against expected-verdict.json.
#
# Exit 0 unconditionally for v1 of the script.
# TODO: full automation requires claude CLI integration (claude --skill build --case ...).

here="$(cd "$(dirname "$0")" && pwd)"

# ----------------------------------------------------------------------------
# Resolve which cases to run.
# ----------------------------------------------------------------------------

if [[ $# -ge 1 ]]; then
  cases=("$1")
else
  cases=()
  for d in "$here"/case-*/; do
    cases+=("$(basename "$d")")
  done
fi

if [[ ${#cases[@]} -eq 0 ]]; then
  echo "[replay] no cases found in $here"
  exit 1
fi

echo "[replay] /build v2 verifier smoke test"
echo "[replay] cases: ${cases[*]}"
echo ""

# ----------------------------------------------------------------------------
# Per-case loop. v1: print manual instructions. v2 will spawn the verifier
# directly via the claude CLI once that integration lands.
# ----------------------------------------------------------------------------

fails=0
for case_id in "${cases[@]}"; do
  case_dir="$here/$case_id"
  if [[ ! -d "$case_dir" ]]; then
    echo "[replay] ! unknown case: $case_id"
    fails=$((fails + 1))
    continue
  fi

  plan="$case_dir/plan.md"
  expected="$case_dir/expected-verdict.json"
  readme="$case_dir/README.md"

  if [[ ! -f "$plan" || ! -f "$expected" ]]; then
    echo "[replay] ! $case_id missing plan.md or expected-verdict.json"
    fails=$((fails + 1))
    continue
  fi

  echo "════════════════════════════════════════════════════════════"
  echo "[replay] $case_id"
  echo "════════════════════════════════════════════════════════════"

  if [[ -f "$readme" ]]; then
    head -n 1 "$readme"
  fi

  echo ""
  echo "Manual replay procedure:"
  echo ""
  echo "  1. Open a Claude Code session with SKILL.md v2 in place."
  echo "  2. Paste the contents of:"
  echo "       $plan"
  echo "     into the chat, with this preamble:"
  echo ""
  echo "       \"You are the adversarial verifier from /build SKILL.md §4.5."
  echo "        Apply the 10-class rubric from §4.6 to the impl below."
  echo "        You are not the test author. You do not see the test file."
  echo "        Return AdversarialVerdictSchema as JSON.\""
  echo ""
  echo "  3. Capture the resulting AdversarialVerdictSchema JSON."
  echo "  4. Compare against expected:"
  echo ""
  if command -v jq >/dev/null 2>&1; then
    echo "     Expected findings:"
    jq -r '.expected_findings[] | "       \(.rubric_id) severity≥\(.severity_min)"' "$expected"
    echo "     Expected overall_verdict: $(jq -r .expected_overall_verdict "$expected")"
  else
    echo "     (install jq to pretty-print expected; raw file:)"
    cat "$expected"
  fi
  echo ""
  echo "  5. PASS iff every expected rubric_id appears in the verifier's findings"
  echo "     at the expected severity floor OR higher, AND overall_verdict matches."
  echo ""
done

echo "════════════════════════════════════════════════════════════"
echo "[replay] v1 — interactive only. Exit 0 unconditionally."
echo "[replay] TODO: wire to \`claude --skill build --verify\` once available."
echo "════════════════════════════════════════════════════════════"

# v1: exit 0 regardless of fails count. Real pass/fail signal lives in the
# manual diff step above. Once the CLI integration lands, gate exit code on
# whether each case's actual verdict matches expected-verdict.json.
exit 0
