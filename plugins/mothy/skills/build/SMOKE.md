# SMOKE — /build v2 validation runbook

Five checks. Run after any change to SKILL.md, or weekly to catch drift. If any check fails, revert SKILL.md to `SKILL.md.v1.backup`.

## 1. Replay 3 frozen bug cases

```bash
bash ~/.claude/skills/build/regression/replay.sh
```

Exit 0 → the verifier rubric catches all three known bug classes (null-clobber, self-skipped modal test, over-mocked resolver) on captured diffs. Exit 1 → at least one miss; revert SKILL.md.

Run a single case:

```bash
bash ~/.claude/skills/build/regression/replay.sh case-01
```

## 2. Trivial-task suppression

Invoke:

```
/build rename foo to bar in src/lib/x.ts
```

Expect: zero `verify:` labels in the run log. The classifier (§0) routes this to the trivial tier; no verifier, no separate test agent.

Fail signal: any `verify:` label appears → the heuristic gate is broken; trivial work is paying the verifier tax.

## 3. Token-budget canary

Invoke `/build` on a 3-unit synthetic plan (standard tier, ~5 files each). Capture total token spend.

Expect: total ≤ 3.5x the v1 baseline for the same plan. The verifier costs ~15-30% extra per unit; loop-until-done at most 3 iterations; this is the upper bound.

Fail signal: spend > 4x baseline → verifier loop is firing repeatedly or rubric is generating churn; tune.

## 4. False-positive smoke

Invoke `/build` on a known-clean unit (e.g. add a docstring to an existing pure function, no behavior change).

Expect: verifier returns mostly `n/a` + a few `pass`, **zero** `fail` at severity `high` or `critical`.

Fail signal: any high+ failure on a docstring change → verifier is hallucinating bugs; rubric needs sharpening (likely R-08 or R-10 firing on benign code).

## 5. Override hatch test

In a real file slated for /build, add a tombstone comment on a line the verifier would otherwise flag:

```ts
// SKIP: R-08 — intentional inline literal for migration script
const FIELD = "Manual Installation ID"
```

Re-run /build on that unit. Verify the next verifier round:
- Sees the `// SKIP: R-08` marker
- Drops R-08 from the findings array for that line
- Still reports R-08 elsewhere if present

Fail signal: tombstone ignored → escape hatch broken, every Airtable PATCH route will churn forever.

---

## On failure

```bash
cp ~/.claude/skills/build/SKILL.md.v1.backup ~/.claude/skills/build/SKILL.md
```

File a fix-log entry under `docs/fix-log/` describing which smoke check failed and what the v2 changed that caused the regression.
