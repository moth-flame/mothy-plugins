# case-02 — self-skipped modal test (no tombstone)

## Unit

- **id:** case-02
- **title:** Pin-modal — submit handler with 400-with-suggestions branch
- **files_touched:** `src/components/stakeholders/location-pin-modal.tsx`, `src/components/stakeholders/__tests__/location-pin-modal.test.tsx`
- **acceptance_criteria:**
  - On submit, POST to `/api/installations/resolve` with the typed name.
  - On 200 → close modal, fire `onResolved(installation)`.
  - On 400 with `{ suggestions: Installation[] }` → render suggestions inline, do not close.
  - On 5xx → show retry banner.

## Implementation (modal — abbreviated)

```tsx
// src/components/stakeholders/location-pin-modal.tsx
"use client"
import { useState } from "react"
import type { Installation } from "@/lib/installations"

export function LocationPinModal({
  open,
  onClose,
  onResolved,
}: {
  open: boolean
  onClose: () => void
  onResolved: (i: Installation) => void
}) {
  const [name, setName] = useState("")
  const [suggestions, setSuggestions] = useState<Installation[]>([])
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function submit() {
    const res = await fetch("/api/installations/resolve", {
      method: "POST",
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      const inst = await res.json()
      onResolved(inst)
      onClose()
      return
    }
    if (res.status === 400) {
      const { suggestions } = await res.json()
      setSuggestions(suggestions)
      return
    }
    setError("Resolver failed — retry?")
  }

  return (
    <div role="dialog">
      <input value={name} onChange={e => setName(e.target.value)} />
      <button onClick={submit}>Pin</button>
      {suggestions.length > 0 && (
        <ul data-testid="suggestions">
          {suggestions.map(s => <li key={s.id}>{s.name}</li>)}
        </ul>
      )}
      {error && <div role="alert">{error}</div>}
    </div>
  )
}
```

## Test (self-skipped — no tombstone)

```tsx
// src/components/stakeholders/__tests__/location-pin-modal.test.tsx
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { LocationPinModal } from "../location-pin-modal"

describe("LocationPinModal", () => {
  it("calls onResolved on 200", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "fort-bragg", name: "Fort Bragg" }),
    } as Response)
    const onResolved = vi.fn()
    render(<LocationPinModal open onClose={() => {}} onResolved={onResolved} />)
    fireEvent.click(screen.getByText("Pin"))
    // hand-wavy await — no proper waitFor
    await new Promise(r => setTimeout(r, 0))
    expect(onResolved).toHaveBeenCalled()
  })

  it("shows retry banner on 5xx", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response)
    render(<LocationPinModal open onClose={() => {}} onResolved={() => {}} />)
    fireEvent.click(screen.getByText("Pin"))
    await new Promise(r => setTimeout(r, 0))
    expect(screen.getByRole("alert")).toBeInTheDocument()
  })

  // dropped 400-with-suggestions test — hard to write deterministically
  //                                      ^^^^ NO `// SKIP: <reason>` tombstone
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
}
```

## What the verifier should catch

- **R-05 (self-skipped test without tombstone):** The test file silently drops the 400-with-suggestions branch — one of three declared acceptance criteria. The comment "dropped 400-with-suggestions test — hard to write deterministically" is a bare excuse, not a `// SKIP: R-XX — <reason>` tombstone. The 400 branch is exactly where suggestion-rendering bugs hide; skipping its coverage is how a "looks done" feature ships broken.

A correct test would either:
- Mock `fetch` to return `{ ok: false, status: 400, json: async () => ({ suggestions: [...] }) }` and assert the `<ul data-testid="suggestions">` is rendered with the right names.
- OR explicitly tombstone with `// SKIP: R-05 — covered by integration test foo.test.ts:42` if it actually IS covered upstream.

## Reference

- Real modal: `/Users/rich/Documents/GitHub/opshub/src/components/stakeholders/location-pin-modal.tsx`
- Real test: `/Users/rich/Documents/GitHub/opshub/src/components/stakeholders/__tests__/location-pin-modal.test.tsx`
