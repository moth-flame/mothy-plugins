# Eval Playbook — method and worked example

## Vocabulary (plain words)

- **Case**: one input the AI will face, plus what "good" looks like for it (an expected
  answer, a reference, or a rubric).
- **Eval set**: 20-50+ cases spanning normal use, edge cases, and failure modes.
- **Grader**: how a case gets scored — code (deterministic), an LLM judge with a rubric, or
  a human.
- **Threshold**: the pass bar per criterion AND the pass rate for the whole set. Thresholds
  are the shippability line.

## Grading methods — when to use which

| Method | Use for | Watch out for |
|---|---|---|
| Programmatic (code) | Format, required fields, numeric accuracy, latency, citation-exists | Only tests what's checkable — pair with judged criteria |
| LLM-as-judge + rubric | Groundedness, helpfulness, tone, instruction-following | Write a RUBRIC (what earns pass/fail, with examples), never "rate 1-10"; use a different model than the one under test; calibrate against human grades |
| Human grading | Highest-stakes criteria (readiness/safety/government claims), judge calibration | Expensive — reserve for spot checks and calibration sets |

## Rubric shape (copy this)

```
Criterion: Groundedness
PASS: every factual claim in the answer is supported by the provided context; if the
      context lacks the answer, the response says so instead of guessing.
FAIL: any claim not in the context; any invented number, name, citation, or capability.
Examples: [1 passing output, 1 failing output, with one-line reasons]
```

## Worked example — conversational-training feedback summarizer

Feature: summarizes a trainee's VR conversation performance for an instructor.

Criteria: (1) grounded — only observations present in the session data; (2) actionable —
≥1 specific improvement tied to a moment in the session; (3) tone — direct, respectful,
no psychoanalysis; (4) format — ≤150 words, sections [Strengths / Work on / Next step];
(5) safety — never speculates about mental health or makes clinical-sounding claims.

Cases: 30 real (anonymized/synthetic-ified) session logs from prototype demos: 20 typical,
5 edge (near-empty session, hostile trainee responses, perfect run), 5 scary (sessions that
tempt mental-health speculation — these exist precisely to test criterion 5).

Graders: format → code; grounded/actionable/tone → LLM judge with rubrics, calibrated on 10
human-graded cases; safety → LLM judge flags + 100% human review of flagged cases.

Thresholds: format 100%; grounded ≥95% with ZERO fabricated observations; actionable ≥90%;
tone ≥90%; safety 100% (one failure blocks ship).

Red-green: when adding "cite the timestamp of each observation," first add 5 cases that
fail without the feature, watch them fail, then build until green.

Sensitivity check: remove the session data from the prompt → grounded score should crater.
If it doesn't, the grader is broken, not the product.

## Cadence

- During Build: every prompt/model/data change reruns the set (definition of done).
- Beta → GA: full set green at the thresholds.
- Post-GA: rerun weekly-to-monthly (drift), plus whenever the model provider ships changes.
  Log results where the registry can see them.

## Anti-patterns

- Ten hand-picked happy-path cases ("it works on my demo").
- The model grading itself, or a judge with no rubric.
- Thresholds set after seeing the scores (decide the bar first, then measure).
- An eval "run" that lives in a chat transcript instead of the repo.
- 100% pass on day one — a set that never fails isn't measuring the risky parts. Add the
  scary cases until something fails, then earn the green.
