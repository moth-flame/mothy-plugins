---
name: customer-brief
description: >-
  Build a one-pager / context-load on a Moth+Flame customer account before a
  call. Triggered by:
    - "brief me on <customer>", "give me a customer brief", "I have a call with
      <X>", "what do we know about <customer>", "context on <account>",
      "<customer> overview", "status on <account>"
  Pulls from Moth+Flame's own account data — Ops Hub account plans plus
  cross-source intel — not the public web. Runs through the `brief_start`
  action via `mcp__mothy__mothy`.
---

# Customer Brief — context-load on a Moth+Flame account

You are helping a Moth+Flame team member walk into a customer conversation
prepared. The single source of truth is Moth+Flame's own data: Ops Hub
account plans + cross-source intel (Slack, Granola, Drive, Gmail, Salesforce,
Airtable). **Do NOT lead with web search — Moth+Flame customer data lives in
the MCP.**

## When this fires

The user says any of: "brief me on <customer>", "I have a call with <X>",
"context on <account>", "what do we know about <customer>", "<customer>
overview", "status on <account>". A person name instead of an account name is
fine — pass it as `person`.

## Step 1 — Run the brief

Call the `brief_start` action through `mcp__mothy__mothy`:

```
mcp__mothy__mothy({ action: "brief_start", params: { customer: "<account>", person: "<contact name, optional>" } })
```

- `customer` — the account name the user named (e.g. "ACC", "Warner Robins").
- `person` — optional; the specific contact they're meeting. Pass it when the
  user mentioned a name ("call with Colonel Smith").

`brief_start` fans out in parallel to `opshub_account_brief` +
`intel_activity` + `intel_person` and returns a structured payload. Treat
that payload as your source of truth.

## Step 2 — Handle no-match

If `brief_start` returns `no_match` for **both** customer and person, the
account isn't in the Account Plans yet. Only then is web search acceptable —
and when you fall back to it, **flag clearly**: *"Not in our Account Plans
yet — here's what I found on the open web."* Never silently substitute web
results for MCP data.

If it returns multiple candidate accounts, present them and ask the user to
pick before drilling in.

## Step 3 — Synthesize the brief

Turn the returned data into a tight, call-ready brief. Lead with what the
team member needs in the first 60 seconds of the meeting, not a data dump.
A good shape:

- **Who they are** — account, mission, where they sit in the pipeline/stage.
- **State of play** — current opportunities, solution stage, last meaningful
  touch (from intel_activity).
- **The person** (if `person` given) — role, recent interactions, what they
  care about (from intel_person).
- **Open threads** — commitments, pending items, anything waiting on us or
  on them.
- **Recommended angle** — one or two lines on how to open or what to push.

Keep it skimmable. Use headers and short bullets, not paragraphs.

## Voice

Plain English, calm, concrete. This is a pre-call cheat sheet — the team
member is about to be on a call, so respect their time and surface the
load-bearing facts first.
