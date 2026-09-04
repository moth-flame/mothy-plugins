# Telemetry — what the mothy plugin sends, and how to stop it

One thing leaves your machine, once a UTC day, from the SessionStart hook
`hooks/report-plugin-heartbeat.mjs`. This page is the whole of it.

## Why it exists at all

`check-plugin-freshness.mjs` warns you when your installed plugin is behind.
It ships *inside* the plugin, so it cannot speak when the plugin is disabled or
uninstalled — a machine ran version 0.1.1, disabled, for two and a half months
and nothing anywhere could say so. The absence of a report is the only signal
that reaches that case, and an absence is only visible from off the machine.

There is deliberately no `enabled` field, for the same reason: a disabled
plugin's hook does not run, so the field could only ever read `true`.

## What is sent — four fields, and the count is the point

| field | value | why |
| --- | --- | --- |
| `claimed_email` | the `@mothandflamevr.com` address the Claude Code CLI is signed in with | the WHO. Self-asserted; see "Honest limits" |
| `plugin_version` | the version of the plugin build that is running, e.g. `0.26.6` | the question being asked |
| `install_id` | a random UUID stored at `~/.claude/.mothy-plugin-install-id` | two Macs, one of them stale, is the exact case this exists for |
| `freshness_state` | `current`, `stale` or `unknown` — the same verdict the local freshness warning renders | proves the local guard is working, or that it is blind |

## What is NOT sent

No cwd. No repo or branch name. No hostname or machine name.
No session content — not your prompts, not Claude's replies, not file
names, not diffs. No time of day, no timestamp of any kind: the server
records a **UTC date** only, so the store cannot answer what hours you work. No OS, no CLI
version, no IP in our record, no session id.

The request goes to one compiled-in `https://` endpoint on Moth+Flame's own
Vercel deployment. It carries no credential — this repository is public, so no
secret can ship in it. The hook **never reads the server's reply**: a
SessionStart hook's output lands in the model's context, and parsing a remote
response there would be an injection channel.

## Retention

**45 days.** Every stored key expires on its own; there is no history table and
no archive. After 45 days without a heartbeat your row simply stops existing.

## Who reads it

Moth+Flame admins, as a fleet report: who is behind, by how much, and who has
gone silent. You can read your own row through the Mothy connector; nobody can
read anybody else's.

## Turning it off

```sh
export MOTHY_PLUGIN_HEARTBEAT=0
```

Put that in your shell profile and the hook returns immediately — no file is
written, no request is made, no id is minted. Off-values are `0`, `off`,
`false`, `no`. Anything else, including leaving it unset, leaves it on.

Turning it off makes you *invisible*, not *exempt*: your row goes absent, which
is the same shape as a disabled plugin. Tell Rich if you have switched it off,
and he can mark you opted out so the fleet report stops counting you as
unknown.

## Deleting the install id

```sh
rm ~/.claude/.mothy-plugin-install-id
```

The file is yours. Deleting it is safe; the next session mints a new random id
and your old row expires on its own within 45 days. Note that the file survives
uninstalling the plugin — deleting it is the only thing that removes it.

Two other small files the hook keeps in `~/.claude/`, both harmless to delete:
`.mothy-plugin-heartbeat-day` (the once-a-day stamp) and
`.mothy-plugin-heartbeat-notice` (a marker that you have already seen the
first-run notice).

## Honest limits

- **The email is self-asserted.** Nothing in a public repository can prove who
  is sending. The server checks the address against the team roster, and that
  is the whole of the check. Anyone who reads this repository could post a
  heartbeat naming somebody else; the payoff for doing so is making a
  colleague's plugin look up to date. This is a recorded, accepted trade —
  the alternative was shipping a credential into a public repository.
- **Our record holds no timestamp or IP. The systems underneath it do.**
  Vercel's request logs and the Upstash datastore keep per-request time and
  source IP on their own schedules, outside our 45-day expiry. That is true of
  every hosted service and is stated here rather than implied away.
- **`install_id` is a pseudonymous per-machine identifier tied to an identified
  person.** It is random rather than derived from your hostname, but it is not
  anonymous: it lets us see that *one of your machines* is stale, at date
  granularity, for 45 days.
- **If the daily stamp cannot be written, every session posts.** That is
  bounded — one small request per session start — and it is the correct
  direction: a rate limiter that cannot write must not become a suppressor.
