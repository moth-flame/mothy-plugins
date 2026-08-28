# Organization skills (Chat / Cowork)

Claude Code loads these from the **mothy plugin**. Chat and Cowork do **not**.
Upload a zip from this directory via claude.ai → Organization settings → Skills.

Each folder is one skill (`name` must match the folder name). Zip the **folder**:

```
cd org-skills
zip -r ~/Desktop/mc.zip mc
```

The zip root must be `mc/SKILL.md`, not a bare `SKILL.md`.

Do not add these folders under `plugins/mothy/skills/` — that would ship them
twice inside the plugin.
