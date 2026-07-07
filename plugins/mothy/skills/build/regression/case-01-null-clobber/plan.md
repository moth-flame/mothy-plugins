# case-01 — null-clobber-on-write (PATCH route)

## Unit

- **id:** case-01
- **title:** Stakeholder PATCH route — write manual location overrides to Airtable
- **files_touched:** `src/app/api/stakeholders/[id]/route.ts`
- **acceptance_criteria:**
  - When AE sets `manualLat` + `manualLon`, write them to Airtable `Resolved Lat` / `Resolved Lon`.
  - When AE sets `manualInstallationId`, resolve to lat/lon via the installations table and write all three.
  - Existing `Resolved Lat` / `Resolved Lon` (from signature mining or role-parse) MUST NOT be clobbered when the PATCH body has `manualLat: null`.

## Implementation (impl-only diff — verifier sees this)

```ts
// src/app/api/stakeholders/[id]/route.ts (excerpt)
import { airtable } from "@/lib/airtable/client"
import type { NextRequest } from "next/server"

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const body = await req.json()
  const fields: Record<string, unknown> = {}

  // Manual installation
  if ("manualInstallationId" in body) {
    fields["Manual Installation ID"] = body.manualInstallationId
  }

  // Manual lat/lon — write straight through to Resolved Lat/Lon
  // BUG: if body has { manualLat: null, manualLon: null } (cleared by AE),
  // we write null to Resolved Lat/Lon, clobbering a signature-mined value.
  // No guard checks whether the previous source was higher-tier.
  if ("manualLat" in body) {
    fields["Resolved Lat"] = body.manualLat
  }
  if ("manualLon" in body) {
    fields["Resolved Lon"] = body.manualLon
  }

  // Hardcoded field-name strings — no constant from a registry.
  await airtable("Stakeholders").update(ctx.params.id, fields)

  return Response.json({ ok: true })
}
```

## Dependency types

```ts
// src/lib/types.ts (relevant excerpt)
export type LocationSource = "Manual" | "Signature" | "Role-Parse"

export interface Stakeholder {
  resolvedLat?: number | null
  resolvedLon?: number | null
  locationSource?: LocationSource | null
  locationConfidence?: number | null
}
```

## What the verifier should catch

- **R-03 (null-overwrite-without-guard):** PATCH writes `Resolved Lat: null` to Airtable when `manualLat` happens to be null in the request body, clobbering a previously valid `Signature` or `Role-Parse` value. No guard reads current `locationSource` and skips the write when current source is higher-tier or when manual is being cleared.
- **R-07 (precedence write loses data):** Lower-tier Manual=null write overrides a higher-tier Signature-mined value. Should resolve through `resolveLocation` / `TIER_RANK` from `src/lib/stakeholder-location.ts` before writing to the Resolved fields.

A correct impl would:
1. Build a Manual candidate via `buildManualCandidate({ manualInstallationId, manualLat, manualLon })`.
2. Fetch current stakeholder, read `readResolvedCandidate(s)` for current state.
3. If candidate is null AND current source is `Signature` or `Role-Parse`, do not touch Resolved* fields — only update Manual* fields.
4. Otherwise re-run `resolveLocation` with all known candidates and write the winning one.

## Reference

- Real route: `/Users/rich/Documents/GitHub/opshub/src/app/api/stakeholders/[id]/route.ts`
- Real resolver: `/Users/rich/Documents/GitHub/opshub/src/lib/stakeholder-location.ts`
- Real writer: `/Users/rich/Documents/GitHub/opshub/src/lib/stakeholder-location-write.ts`
