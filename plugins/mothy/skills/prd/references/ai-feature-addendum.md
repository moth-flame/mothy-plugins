# AI Feature Addendum — for PRDs whose core behavior is probabilistic

Distilled from Miqdad Jaffer's AI-PMF framework (the 4D method + AI Launch Strategy Canvas)
and Moth+Flame's planning process AI Feature Addendum. Apply when the feature's core value
depends on model behavior — conversational AI, prediction, generation, scoring.

AI-native problems often look like minor nuisances users have normalized ("invisible pain
points"). Feature augmentation (existing workflow + AI on top) is not AI-native innovation.

## 1. Structure the work with the 4D phases

- **Discover**: market/business/product/user context → AI solution hypothesis.
- **Design**: future-state workflow with AI integrated; prototypes demonstrating AI
  capabilities; initial prompts and interaction patterns.
- **Develop**: model selection; input specs and output quality criteria; prompt/system
  instruction iteration; data prep; eval sets.
- **Deploy**: launch/rollout strategy; monitoring and feedback loops; continuous improvement.

## 2. Dual success metrics (both required in the PRD)

- **User metrics**: retention (30/90-day), DAU/WAU/MAU, conversion to core actions, task
  completion.
- **AI-quality metrics**: output accuracy and error rates, hallucination rate, user-rated
  response quality (CSAT on AI interactions), correction rates and improvement from feedback.

PMF for an AI feature = sustained usage AND high precision/recall/trust. Traditional PRDs
assume deterministic behavior; this one plans for probabilistic behavior.

## 3. Eval discipline

- Eval set defined at Commit (contents, construction, pass thresholds).
- Runs in CI during Build; passing evals is part of definition of done each sprint.
- Green eval results gate Beta → GA. Launch comms wait for green evals.
- In Moth+Flame's market an unproven prediction is a liability: an efficacy plan (cohorts,
  baselines, longitudinal comparison, statistical evaluation, control group) belongs in the
  PRD for anything making readiness/behavioral claims.

## 4. Failure modes and drift

- Design what happens when the model is wrong and how the user recovers — before Build.
- Post-GA: standing metric reviews on a cadence with a named owner. User expectations and
  model behavior both drift; AI PMF is a moving target, not a checkbox.

## 5. Scale readiness (pre-GA check)

Before GA, assess the four Launch Strategy Canvas dimensions — Customer (segment size,
retention, pain magnitude), Product (unfair advantage, reach, uniqueness), Company (infra
scalability, GTM viability, team capacity), Competition (rivals, barriers to entry, supplier
power incl. model-provider dependence). Scale only when all four are green.
