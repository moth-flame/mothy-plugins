---
name: onboard
description: >-
  Two related onboarding flows for Moth+Flame vibe-coding (AI-assisted work).
  ADMIN: start onboarding a teammate. Triggered by an admin saying "onboard
  <person>", "onboard @user", "set up X with vibe coding", "kick off X's
  onboarding", "/vibe-onboard X", or bare "onboard" (then ask who). SELF: a
  team member resuming their own walkthrough — "start the walkthrough",
  "continue my onboarding", "what's next in my onboarding". Admin flow runs
  `admin_vibe_start`; self flow runs `vibe_get_walkthrough` — both via
  `mcp__mothy__mothy`.
---

# Onboard — vibe-coding setup for Moth+Flame

Two distinct paths. Pick by who's asking and what they said.

- **Admin path** — Rich (or another admin) asks to onboard *someone else*.
  Kicks off a stateful Slack-DM flow. **Admin-only.**
- **Self path** — a team member resuming their own walkthrough in the current
  chat. Open to anyone connected to Mothy.

---

## Self path (anyone) — resume the walkthrough

If the user says "start the walkthrough", "continue my onboarding", or
"what's next in my onboarding", call:

```
mcp__mothy__mothy({ action: "vibe_get_walkthrough" })
```

Drop the returned walkthrough content into the chat and follow it. This is the
"let's build your first thing" part of onboarding — discovery → pick what to
build → ship something this week. No admin privileges required.

---

## Admin path (ADMIN ONLY) — onboard a teammate

> The steps below start and drive another person's onboarding session. Only an
> admin should run them. If you are not the admin who can vouch for the new
> user, stop and route the request to Rich.

### Trigger

An admin DMs Mothy: `onboard @aaron`, `onboard aaron@mothandflamevr.com`,
`start vibe onboarding for Aaron`, `onboard Aaron`, or bare `onboard`.

**Admin self-onboarding is not supported.** If the resolved target email is
the same as the admin who sent the DM, reply that they already have admin
access and STOP — do not call `admin_vibe_start` (it also rejects this
server-side).

**Bare `onboard` with no target:** reply immediately asking who to onboard
(@username, @mothandflamevr.com email, or full name), then wait for a
resolvable identity before continuing. Never call `admin_vibe_start` without
one.

### Steps

1. **Resolve the target** to an email + Slack user ID:
   - `<@U0123ABC>` mention token → Slack `users.info` → profile.email.
   - `@aaron` literal text → fuzzy match Slack display names via `users.list`.
   - an email → Slack `users.lookupByEmail` for the Slack user ID.
   - a bare first name → try `users.lookupByEmail` with
     `<firstname>@mothandflamevr.com` first.
   - lookup fails → ask the admin to paste the @mothandflamevr.com email.

2. **Start the session** via `mcp__mothy__mothy`:
   ```
   mcp__mothy__mothy({ action: "admin_vibe_start", params: { email, slack_user_id, display_name } })
   ```
   - `session_already_active` → tell the admin a session is in progress and
     offer to restart.
   - success → continue.

3. **DM the onboardee** the kickoff (Claude Desktop install + Pro on Divvy +
   set model to Opus 4.8 / High). Open the IM channel via Slack
   `conversations.open`.

4. **Advance state** so the kickoff is recorded
   (`vibe_session_advance` with `patch.phase = 'install_desktop'`).

5. **Confirm to the admin** that the kickoff DM went out, and that you'll
   report progress.

6. **Emit telemetry:**
   `vibe_onboard_event {session_id, phase: 'M-start', outcome: 'ok', notes: 'kickoff sent'}`.
   `notes` MUST NOT include emails, names, or file paths — verbs + friction
   patterns only.

### Driving the DM flow

Any incoming Slack DM: first call `vibe_session_get {slack_user_id}`. If a
session exists and isn't `complete`/`abandoned`, you're in session-driven
mode — follow the phase the session is in. Append inbound + outbound messages
to history via `vibe_session_advance`, and emit `vibe_onboard_event` at every
phase boundary.

Phases run: `install_desktop` → `install_connected` (connect Mothy connector,
set tools to "Always allow") → `discovery` (5 probes → pick Track A–E;
short-circuit customer-deck requests to the `deck` skill) → optional
`escalating_access` (repo/DB access — escalate to Rich) → optional
`install_cursor` / `cursor_connected` (Track A/D only) →
`walkthrough_handoff` (hand off to Cowork/Cursor; user pastes the walkthrough
kickoff which runs the **self path** above).

### Escalation to Rich (admin path)

- User asks for repo/DB access → DM Rich with grant/deny options; hold the
  onboardee with a waiting message until Rich replies.
- User signals distress (3+ "stuck" in a row, or silence > 2 days after
  committing) → DM Rich.
- Anything outside scope (HR, billing, weird Workspace issue) → DM Rich.

### Cleanup

A non-terminal session idle > 7 days → `admin_vibe_abandon {slack_user_id}`
(a Vercel cron also does this; this is backup).

---

## Voice + tone (both paths)

- Plain English, calm, concrete. No jargon without a one-line explanation.
- Match Moth+Flame's voice — warm, fast, no-nonsense.
- One topic per message. Don't bury the lede.
- If they're stuck, drop into smaller steps — never repeat the same
  instruction louder.

## Admin actions available via `mcp__mothy__mothy`

`admin_vibe_start`, `vibe_session_get`, `vibe_session_advance`,
`vibe_session_list`, `admin_vibe_abandon`, `vibe_onboard_event`,
`admin_set_registry_entry`, `admin_get_registry_entry`,
`admin_list_registry`, `admin_create_token`, `admin_list_tokens`,
`admin_revoke_token`, `admin_revoke_vibe_tokens_for`. Plus `intel_person`
to seed persona context, and `vibe_get_walkthrough` for the self path.
Discover everything with `mcp__mothy__mothy_help`.
