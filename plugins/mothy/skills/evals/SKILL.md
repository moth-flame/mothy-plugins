---
name: evals
description: >-
  Guide anyone at Moth+Flame through building an eval set that proves an AI
  feature actually works — no prior eval experience assumed. Triggered by:
    - "eval", "evals", "eval set", "write evals"
    - Intent without the word: "how do I know the AI is working", "test the
      AI", "the answers are wrong sometimes", "how accurate is it", "is it
      good enough to ship", "quality bar for the model", "it hallucinated",
      "prove it works"
    - The prd skill's AI Behavior & Evaluation section needs an eval plan.
  Green evals gate Beta → GA for AI features.
---

# Evals — proving an AI feature works

Help the user build an eval set: a graded collection of test cases that measures whether
the AI behavior is good enough, catches regressions, and gates releases. Assume ZERO prior
eval knowledge — most people invoking this won't know the word "eval"; they know "sometimes
it gives bad answers and I don't know if it's safe to ship." Never make them feel behind.

Read `references/eval-playbook.md` for the full method and worked example.

## The five steps (walk them through in order)

1. **Define "good" in their words.** Ask: "Show me one output you'd be proud to ship, and
   one that would embarrass you. What's the difference?" Turn their answer into 3-6 written
   quality criteria (correctness, groundedness, tone, format, safety — whatever THEY named).
   Criteria they can't articulate yet get discovered in step 2.

2. **Collect real cases, not invented ones.** Gather 20-50 input cases from reality:
   prototype demo sessions, Granola transcripts, actual documents/data the feature will see,
   plus the edge cases that scare them ("what if someone asks about X?"). Invented cases
   test imagination; real cases test the product. Label each case with the expected outcome
   or a reference answer where one exists.

3. **Choose the grading method per criterion** (see playbook for details):
   - Exact/programmatic checks for anything deterministic (format, required fields, numbers).
   - Rubric-graded LLM-as-judge for qualitative criteria — with a written rubric, NOT
     "rate 1-10"; calibrate the judge against 5-10 human-graded examples first, and never
     let the model being tested judge itself.
   - Human spot-grading for the highest-stakes criteria (in this company: anything touching
     readiness, safety, or government claims).

4. **Set thresholds honestly.** For each criterion: the pass bar for a single case, and the
   pass rate the SET must hit (e.g., "≥95% of cases grounded, zero fabricated citations").
   The thresholds are the definition of done for the AI behavior — they gate Beta → GA and
   go in the PRD's AI Behavior & Evaluation section.

5. **Make it runnable and rerunnable.** Evals live in the project repo as data + a runner
   (the /mothy:build red-green pattern applies: a new behavior gets a failing eval first).
   Rerun on every meaningful change — prompt edits, model swaps, data changes — and after
   GA on a drift cadence. An eval that ran once is a screenshot, not a gate.

## Judging whether the evals are any good (do this WITH them)

- **Coverage check**: do cases span the personas, inputs, and failure modes from the PRD?
  If every case is a happy path, the set is decoration.
- **Sensitivity check**: deliberately break the system (weaken the prompt, feed wrong
  context) — do scores drop? An eval set that can't detect a sabotaged system can't detect
  a regression either. This is adversarial review applied to the evals themselves.
- **Judge reliability**: re-grade 10 cases by hand; if human and judge disagree >10-15% of
  the time, fix the rubric before trusting the numbers.
- **Goodhart check**: could the system score well while being bad? (e.g., always refusing =
  100% "safe"). Add criteria that punish the cheat.

## Integration points

- The prd skill's AI Behavior & Evaluation section links the eval plan; dual metrics
  (user + AI-quality) come from the same criteria.
- Green evals gate Beta → GA; results are recorded in the R&D Project Registry entry.
- Post-GA: rerun on a drift cadence with a named owner.

## Surface notes

Claude Code: evals run via the repo's runner; wire into /mothy:test where applicable.
Chat/Cowork: build the eval set as structured docs/sheets; execution happens wherever the
product runs — the skill still owns criteria, cases, rubrics, and thresholds.
