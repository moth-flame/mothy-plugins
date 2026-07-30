---
description: Edit a Google Doc / Sheet / Slides IN PLACE — never export-and-replace
argument-hint: "[file URL + what to change]"
---

Invoke the **edit-in-place** skill for $ARGUMENTS — edit the existing Google
Workspace file in place (same file id, so its URL, sharing, comments and
revision history survive), never export-and-replace. Read first
(`docs_read` / `docs_get_structure` / `sheets_read` / `slides_get`) so the edit
targets exact ranges rather than rewriting whole blocks.
