# Organization skills

The **Mothy plugin** (`mothy@mothy-marketplace`) already reaches **Chat,
Cowork, and Claude Code**. Uploading a zip of a skill the plugin already
ships (`mc`, `deck`, `video`, …) produces **two `/name` entries** — one
labelled as an organization skill, one labelled "Mothy plugin".

**Do not org-upload a plugin skill.** Delete the org copy if it is already
there. One catalog: the plugin.

This directory is only for a skill that must exist in Chat/Cowork **and must
not** exist in Claude Code. Zip the **folder** (`name` = folder name):

```
cd org-skills
zip -r ~/Desktop/<name>.zip <name>
```

The zip root must be `<name>/SKILL.md`, not a bare `SKILL.md`.

Do not add these folders under `plugins/mothy/skills/` — that would ship
them twice inside the plugin, which is a different duplicate.
