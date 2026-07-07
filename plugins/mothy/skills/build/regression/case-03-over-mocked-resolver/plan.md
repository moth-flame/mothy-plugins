# case-03 — over-mocked resolver test

## Unit

- **id:** case-03
- **title:** Manual location candidate builder — resolve installation by id or alias
- **files_touched:** `src/lib/stakeholder-location.ts`, `src/lib/__tests__/stakeholder-location.test.ts`
- **acceptance_criteria:**
  - `buildManualCandidate({ manualInstallationId: "fort-bragg" })` returns a candidate with `installationName: "Fort Bragg"`, `lat: 35.14`, `lon: -79.00`.
  - `buildManualCandidate({ manualInstallationId: "82nd Airborne" })` (alias) returns the same fort-bragg candidate.
  - When `getById` returns null AND `findByAlias` returns null, return a candidate with `installationId: null`, `installationName: null`, `lat: null`, `lon: null`.

## Implementation

```ts
// src/lib/stakeholder-location.ts (relevant excerpt)
import { getById, findByAlias, type Installation } from "./installations"

export function buildManualCandidate(args: {
  manualInstallationId?: string | null
  manualLat?: number | null
  manualLon?: number | null
}): LocationCandidate | null {
  const hasInstallation = !!args.manualInstallationId
  const hasLatLon = args.manualLat != null && args.manualLon != null
  if (!hasInstallation && !hasLatLon) return null

  let inst: Installation | null = null
  if (hasInstallation) {
    inst = getById(args.manualInstallationId!) ?? findByAlias(args.manualInstallationId!)
  }

  return {
    installationId: inst?.id ?? null,
    installationName: inst?.name ?? null,
    lat: hasLatLon ? args.manualLat! : inst?.lat ?? null,
    lon: hasLatLon ? args.manualLon! : inst?.lon ?? null,
    source: "Manual",
    confidence: 100,
  }
}
```

## Test (over-mocked)

```ts
// src/lib/__tests__/stakeholder-location.test.ts
import { describe, it, expect, vi } from "vitest"

// BUG: both getById and findByAlias are stubbed to ALWAYS return the
// expected installation, regardless of the input. The test passes whether
// the resolver actually looks up the right id, falls through to alias
// correctly, or just blindly returns a hardcoded fort-bragg. The impl's
// `getById(x) ?? findByAlias(x)` precedence is never exercised.
vi.mock("../installations", () => ({
  getById: vi.fn(() => ({ id: "fort-bragg", name: "Fort Bragg", lat: 35.14, lon: -79.00 })),
  findByAlias: vi.fn(() => ({ id: "fort-bragg", name: "Fort Bragg", lat: 35.14, lon: -79.00 })),
}))

import { buildManualCandidate } from "../stakeholder-location"

describe("buildManualCandidate", () => {
  it("resolves by id", () => {
    const c = buildManualCandidate({ manualInstallationId: "fort-bragg" })
    expect(c?.installationName).toBe("Fort Bragg")
    expect(c?.lat).toBe(35.14)
  })

  it("resolves by alias", () => {
    const c = buildManualCandidate({ manualInstallationId: "82nd Airborne" })
    expect(c?.installationName).toBe("Fort Bragg")
  })

  it("returns nulls when not found", () => {
    // doesn't actually exercise the not-found branch — mocks above
    // still return fort-bragg. Test passes vacuously.
    const c = buildManualCandidate({ manualInstallationId: "nonexistent" })
    expect(c).not.toBeNull()
  })
})
```

## Dependency types

```ts
// src/lib/installations.ts (excerpt)
export interface Installation {
  id: string
  name: string
  lat: number
  lon: number
  aliases?: string[]
}
export function getById(id: string): Installation | null
export function findByAlias(alias: string): Installation | null
```

## What the verifier should catch

- **R-06 (over-mocked test):** Both `getById` and `findByAlias` are mocked to ALWAYS return the expected fort-bragg installation regardless of input. The test passes if the resolver:
  - Looks up the right id ✓
  - Looks up the wrong id but the mock returns fort-bragg anyway ✓ (false positive)
  - Skips the `getById` call and goes straight to `findByAlias` ✓ (precedence bug, undetected)
  - Returns a hardcoded value ignoring inputs entirely ✓ (impl broken, test green)
  - The "not found" branch test asserts `c).not.toBeNull()` — never actually triggers the not-found path because the mock won't let it.

A correct test would either:
- Use the real `installations.ts` module with a known seed dataset (preferred — the installations file is a small static JSON-backed registry).
- OR mock with `vi.fn().mockImplementation((id) => REAL_LOOKUP[id] ?? null)` so the mock honors inputs.

## Reference

- Real resolver: `/Users/rich/Documents/GitHub/opshub/src/lib/stakeholder-location.ts`
- Real test: `/Users/rich/Documents/GitHub/opshub/src/lib/__tests__/stakeholder-location.test.ts` (uses real installations module — the correct pattern)
