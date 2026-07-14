---
name: edit-in-place
description: >-
  Edit Google Workspace files (Docs / Sheets / Slides) IN PLACE via Mothy
  actions — never export-and-replace. Triggered by:
    - "update the Q2 numbers in this sheet", "bold the header row", "swap
      {{customer}} across the deck", "fix the date in this doc", "edit this in
      place", or any request to change an existing Google Doc / Sheet / Slides
      file given its URL
  Office binaries (.docx / .xlsx / .pptx) → convert to native first, then edit
  in place. Uses the native-edit actions through `mcp__mothy__mothy`.
---

# Working with Google Workspace files — edit in place, never re-upload

The #1 mess to avoid in Cowork: having Claude export a new `.docx` / `.xlsx` /
`.pptx` and uploading it over the old file. That splits a file's history across
many copies, locks collaborators onto stale versions, and burns tokens + time
rebuilding the whole file when you only changed a line.

## The rule

> **Native Google formats (Docs / Sheets / Slides) → edit in place via Mothy.**
> **Office binaries (`.docx` / `.xlsx` / `.pptx`) → convert to native first, then edit in place.**
> **Never export-and-replace. Rely on Google revision history, not file names.**

Editing in place keeps comments, suggestions, and revision history intact, and
the change is attributed to **you** (your Google identity), not a bot.

## How (once Mothy is connected)

Just ask Claude in plain English — *"update the Q2 numbers in this sheet,"*
*"bold the header row,"* *"swap {{customer}} for Acme across the deck,"*
*"fix the date in this doc."* Give it the file's URL and say **"edit it in
place — don't make a new version."** Claude calls the right Mothy action via
`mcp__mothy__mothy`:

| You want to… | Native Google file | What Claude uses |
|---|---|---|
| Read a doc/sheet/deck | ✅ | `docs_read` / `sheets_read` / `slides_get` |
| Change cell values | Sheet | `sheets_update` / `sheets_append` |
| Format cells, add/delete rows or tabs | Sheet | `sheets_batch_update` |
| Find/replace text | Doc / Deck | `docs_replace_text` / `slides_replace_text` |
| Change formatting (bold, headings, color) | Doc | `docs_get_structure` → `docs_batch_update` |
| Edit slide content / layout | Deck | `slides_batch_update` |
| Create a new file | any | `docs_create` / `sheets_create` / `slides_create` |
| Delete a file | any | `drive_trash` |

Each row maps to a `mcp__mothy__mothy({ action: "<name>", params: {...} })`
call. Read first (`docs_read` / `sheets_read` / `slides_get` /
`docs_get_structure`) so you target the right ranges, then apply the edit.

## MANDATORY — Slides: post-edit geometry + visual verification

**Not optional. Applies after EVERY `slides_batch_update` / `slides_replace_text`
/ `slides_set_table` / `slides_create` call, before you tell anyone the slide is
done.** Ships because of a real incident: 2026-07-14, DZYNE pricing deck — an
agent reported "thumbnails verified" while every yellow section heading on
slide 1 was actually occluded by the content block below it. The self-reported
"verified" was hollow — nothing was actually checked. Do not repeat this.

Full procedure (bounding-box math, flag rules — (a) overlaps, (b) off-slide,
(c) tight gaps, (d) near-edge crowding within ~15pt of any slide edge (added
2026-07-14, commandiq coord `2026-07-14-fb3bb8`) — thumbnail zoom-inspect, and
the required report shape) lives in the **`edit-google-slides`** skill's
"MANDATORY: post-edit geometry + visual verification" section — read it and
follow it exactly for any Slides write, not just this skill's `slides_batch_update`
row above. A bare "verified" or "thumbnails look good" is an invalid report and
must be redone per that section's fixed reporting format. An intentional
full-bleed element may be whitelisted against rule (d), but the whitelist
decision must be stated explicitly in the report — never silent.

## If the file is an Office binary (.docx / .xlsx / .pptx)

Claude can't inline-edit a binary — the Google APIs only edit native files. So:
1. Open it in Google Docs/Sheets/Slides → **File → Save as Google Docs/Sheets/Slides**
   (or in Drive it converts on open). You now have a native file with a real ID.
2. Edit that native file from then on, in place.
3. If others need a `.pptx`/`.xlsx` copy, export **once at the end** for delivery
   — don't keep round-tripping the binary as your working file.

## Why we care (say this if someone asks)

A teammate got locked out of a spreadsheet because new `.xlsx` versions kept
getting uploaded and replaced — no one could tell which was current. Edit in
place and that whole class of problem disappears.
