# case-03 — over-mocked resolver

The test author mocks `getById` and `findByAlias` to ALWAYS return the expected fort-bragg installation — regardless of the input id. The three tests pass:
- "resolves by id" — passes because the mock returns fort-bragg.
- "resolves by alias" — passes because the mock returns fort-bragg.
- "returns nulls when not found" — passes vacuously because the mock still returns fort-bragg; the assertion `expect(c).not.toBeNull()` succeeds for the wrong reason.

The impl could be entirely wrong — could skip `getById` and go straight to `findByAlias`, could return a hardcoded value, could ignore the input — and every test would still pass. This is the false-confidence trap: mock coverage masquerades as logic coverage. Without an adversarial verifier reading the diff and matching against R-06, the unit ships green and the resolver's actual id-then-alias precedence is never exercised until a real bad input hits production.

What the verifier catches: R-06 fires on the `vi.mock` block — both dependency mocks are vi.fn returning the same fixed value, no `mockImplementation` honoring the input argument. Severity medium (not high) because the impl might still be correct — the test just doesn't prove it. Fix prescription: either use the real installations module (small static registry, no I/O) or write `mockImplementation((id) => SEED[id] ?? null)`.
