// Manifest + plugin-shape guards for the mothy Claude Code plugin.
//
// These are pure, no-network characterization tests. They assert the
// invariants that keep the plugin installable and the MCP connection
// tokenless (token is minted via OAuth at connect time, never shipped in
// the repo). RED-GREEN: each assertion below maps to a concrete way the
// plugin could break — corrupt JSON, a token leaking into .mcp.json, a
// skill whose `name` drifts from its directory, a missing command file.
//
// Run: node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const pluginRoot = join(repoRoot, 'plugins', 'mothy');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Minimal YAML frontmatter extractor: pulls the block between the first two
// `---` fences and parses the top-level `key: value` pairs we care about
// (name, description). Handles both inline scalars and `>-`/`|` block
// scalars (we only need to know the key is present + non-empty for those).
function parseFrontmatter(md) {
  const lines = md.split(/\r?\n/);
  if (lines[0].trim() !== '---') {
    throw new Error('missing opening frontmatter fence');
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) throw new Error('missing closing frontmatter fence');

  const body = lines.slice(1, end);
  const fields = {};
  let currentKey = null;
  let blockMode = false;

  for (const raw of body) {
    const topLevel = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(raw);
    const isIndented = /^\s+/.test(raw);

    if (topLevel && !(blockMode && isIndented)) {
      currentKey = topLevel[1];
      const val = topLevel[2];
      if (val === '>-' || val === '>' || val === '|' || val === '|-') {
        // Block scalar — content lives on following indented lines.
        blockMode = true;
        fields[currentKey] = '';
      } else {
        blockMode = false;
        fields[currentKey] = val.trim();
      }
    } else if (currentKey && blockMode && isIndented) {
      const trimmed = raw.trim();
      fields[currentKey] = (fields[currentKey] + ' ' + trimmed).trim();
    }
  }
  return fields;
}

test('marketplace.json parses and has required fields', () => {
  const mkt = readJson(join(repoRoot, '.claude-plugin', 'marketplace.json'));
  assert.equal(typeof mkt.name, 'string');
  assert.ok(mkt.name.length > 0, 'marketplace name must be non-empty');
  assert.ok(Array.isArray(mkt.plugins), 'marketplace.plugins must be an array');
  assert.ok(mkt.plugins.length > 0, 'marketplace must list at least one plugin');
  for (const p of mkt.plugins) {
    assert.equal(typeof p.name, 'string');
    assert.ok(p.name.length > 0, 'plugin entry name must be non-empty');
    assert.equal(typeof p.source, 'string');
    assert.ok(p.source.length > 0, 'plugin entry source must be non-empty');
  }
});

test('plugin.json parses and has required fields', () => {
  const plugin = readJson(join(pluginRoot, '.claude-plugin', 'plugin.json'));
  assert.equal(typeof plugin.name, 'string');
  assert.ok(plugin.name.length > 0, 'plugin name must be non-empty');
  // marketplace plugin entry name must reference the actual plugin name.
  const mkt = readJson(join(repoRoot, '.claude-plugin', 'marketplace.json'));
  const names = mkt.plugins.map((p) => p.name);
  assert.ok(
    names.includes(plugin.name),
    `marketplace must list plugin "${plugin.name}" (found: ${names.join(', ')})`,
  );
});

test('plugin is skills-only — bundles NO MCP connector (.mcp.json absent)', () => {
  // The plugin ships SKILLS + COMMANDS only — it does NOT bundle an MCP
  // connector. Mothy is an ORG connector: it's published to the team and shows
  // up in everyone's Claude Desktop connector list, where the user clicks
  // Connect → Google sign-in (no token, nothing to paste — see the `connect`
  // skill). Bundling a .mcp.json would only create a dead, duplicate placeholder
  // alongside the org connector. (Legacy token URL remains a fallback only.)
  assert.ok(
    !existsSync(join(pluginRoot, '.mcp.json')),
    'plugin must NOT bundle a .mcp.json connector (skills-only — see test comment)',
  );
});

test('every skill SKILL.md has frontmatter with name+description and name===dirname', () => {
  const skillsDir = join(pluginRoot, 'skills');
  assert.ok(existsSync(skillsDir), 'plugins/mothy/skills must exist');
  const skillDirs = readdirSync(skillsDir).filter((d) =>
    statSync(join(skillsDir, d)).isDirectory(),
  );
  assert.ok(skillDirs.length > 0, 'expected at least one skill');

  for (const dir of skillDirs) {
    const skillPath = join(skillsDir, dir, 'SKILL.md');
    assert.ok(existsSync(skillPath), `${dir}/SKILL.md must exist`);
    const md = readFileSync(skillPath, 'utf8');
    const fm = parseFrontmatter(md);
    assert.ok(fm.name && fm.name.length > 0, `${dir}: frontmatter name required`);
    assert.ok(
      fm.description && fm.description.length > 0,
      `${dir}: frontmatter description required`,
    );
    assert.equal(
      fm.name,
      dir,
      `${dir}: frontmatter name "${fm.name}" must match directory name`,
    );
  }
});

test('skills reference live MCP tool ids (mcp__mothy__*), never the dead mcp__openclaw__* ids', () => {
  const skillsDir = join(pluginRoot, 'skills');
  const skillDirs = readdirSync(skillsDir).filter((d) =>
    statSync(join(skillsDir, d)).isDirectory(),
  );
  for (const dir of skillDirs) {
    const md = readFileSync(join(skillsDir, dir, 'SKILL.md'), 'utf8');
    assert.ok(
      !md.includes('mcp__openclaw__'),
      `${dir}/SKILL.md references dead mcp__openclaw__* tool id`,
    );
  }
});

test('every command markdown file parses frontmatter with a description', () => {
  const cmdDir = join(pluginRoot, 'commands');
  assert.ok(existsSync(cmdDir), 'plugins/mothy/commands must exist');
  const cmdFiles = readdirSync(cmdDir).filter((f) => f.endsWith('.md'));
  assert.ok(cmdFiles.length > 0, 'expected at least one command markdown file');
  for (const f of cmdFiles) {
    const md = readFileSync(join(cmdDir, f), 'utf8');
    const fm = parseFrontmatter(md);
    assert.ok(
      fm.description && fm.description.length > 0,
      `${f}: command frontmatter description required`,
    );
  }
});

// The BARE slash-command surface. A plugin SKILL is only addressable as
// `/mothy:<name>` — the CLI namespaces plugin skills (`Plugin skills use
// plugin:skill`). A bare `/deck` exists ONLY because commands/deck.md does.
// So deleting a shim silently removes the short name every teammate types,
// while `claude plugin details` still lists the skill and the plugin UI still
// shows it — the failure is invisible from every diagnostic we had.
//
// This list is the published contract (mirrored in CLAUDE.md > Layout).
// Sampling 3 of them is NOT enough: commit ba6a62f deleted 10 shims and this
// test caught it only via `deck`, and that red was shipped anyway. Enumerate
// the whole surface so the diff shows exactly which short names would die.
const EXPECTED_COMMANDS = [
  'article',
  'audit',
  'brief',
  'build',
  'connect',
  'deck',
  'dev-setup',
  'edit-in-place',
  'fix',
  'mc',
  'onboard',
  'plan',
  'test',
  'update-skills',
  'video',
  'video-setup',
];

test('the full bare slash-command surface is present (no shim silently dropped)', () => {
  const cmdDir = join(pluginRoot, 'commands');
  const cmdNames = readdirSync(cmdDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => basename(f, '.md'))
    .sort();
  const missing = EXPECTED_COMMANDS.filter((c) => !cmdNames.includes(c));
  assert.deepEqual(
    missing,
    [],
    `missing bare slash commands (users type these): ${missing.join(', ')} — found: ${cmdNames.join(', ')}`,
  );
});

test('every command shim points at a skill directory that exists', () => {
  // A shim whose target skill was renamed/removed is a dead short name: the
  // command resolves, then instructs the model to invoke a skill that is gone.
  const cmdDir = join(pluginRoot, 'commands');
  const skillsDir = join(pluginRoot, 'skills');
  const skillDirs = new Set(
    readdirSync(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory()),
  );
  for (const f of readdirSync(cmdDir).filter((f) => f.endsWith('.md'))) {
    const body = readFileSync(join(cmdDir, f), 'utf8');
    // Shims write the target either bare or bolded: "Invoke the **connect** skill".
    const m = /Invoke the \*{0,2}([a-z0-9-]+)\*{0,2} skill/i.exec(body);
    assert.ok(m, `${f}: expected an "Invoke the <skill> skill" line`);
    assert.ok(
      skillDirs.has(m[1]),
      `${f}: targets skill "${m[1]}" which has no skills/${m[1]}/ directory`,
    );
  }
});

// The engineering skills assume a checked-out repo with a runnable test suite — true on
// Agent37 and in a dev's terminal, NOT true for a teammate invoking them from the Claude
// desktop app, where a session may be pointed at no project at all. Without the preflight
// they spawn agents and fail confusingly instead of explaining what to open.
//
// This is the exact content most at risk of being lost: CLAUDE.md calls these copies
// "synced verbatim" from the Mothy repo's .claude/skills/, so a careless re-sync would
// overwrite the block. (The copies already diverge on purpose — see 51a6f46, which made
// them repo- and OS-agnostic — so the marker, not the word "verbatim", is the contract.)
const PREFLIGHT_SKILLS = ['plan', 'build', 'test', 'fix', 'audit'];

test('engineering skills carry the desktop preflight block (survives re-sync)', () => {
  for (const s of PREFLIGHT_SKILLS) {
    const md = readFileSync(join(pluginRoot, 'skills', s, 'SKILL.md'), 'utf8');
    assert.ok(
      md.includes('<!-- BEGIN desktop-preflight'),
      `${s}/SKILL.md lost the desktop-preflight block — a re-sync from the Mothy repo probably overwrote it`,
    );
    assert.ok(
      md.includes('<!-- END desktop-preflight -->'),
      `${s}/SKILL.md: desktop-preflight block is unterminated`,
    );
    // Must actually name the surface and tell the user what to do, not just carry a marker.
    assert.match(
      md,
      /Claude desktop app/,
      `${s}/SKILL.md: preflight must name the Claude desktop app explicitly`,
    );
    // Must run before agents are spawned, or it cannot prevent the confusing failure.
    assert.match(
      md,
      /before spawning any agent/i,
      `${s}/SKILL.md: preflight must order itself before agent spawn`,
    );
  }
});

test('no skill frontmatter contains XML-like tags (org Skills upload rejects them)', () => {
  // The claude.ai org-Skills uploader hard-rejects with
  //   "SKILL.md description cannot contain XML tags"
  // and an argument placeholder written as /plan <topic> trips it — 8 of our skills did.
  // The CLI accepts them, so the plugin channel never surfaced this; it only appears when
  // the same SKILL.md is uploaded as an organization skill. House style is [topic].
  // Body text is NOT checked: code blocks legitimately contain XML/HTML.
  const skillsDir = join(pluginRoot, 'skills');
  const offenders = [];
  for (const dir of readdirSync(skillsDir).filter((d) => statSync(join(skillsDir, d)).isDirectory())) {
    const md = readFileSync(join(skillsDir, dir, 'SKILL.md'), 'utf8');
    const lines = md.split(/\r?\n/);
    let fence = 0;
    for (const line of lines) {
      if (line.trim() === '---') { fence++; if (fence >= 2) break; continue; }
      if (fence !== 1) continue;
      const tags = line.match(/<[A-Za-z/][^>]*>/g);
      if (tags) offenders.push(`${dir}: ${tags.join(' ')}`);
    }
  }
  const orgSkillsDir = join(repoRoot, 'org-skills');
  if (existsSync(orgSkillsDir)) {
    for (const dir of readdirSync(orgSkillsDir).filter((d) => statSync(join(orgSkillsDir, d)).isDirectory())) {
      const md = readFileSync(join(orgSkillsDir, dir, 'SKILL.md'), 'utf8');
      const lines = md.split(/\r?\n/);
      let fence = 0;
      for (const line of lines) {
        if (line.trim() === '---') { fence++; if (fence >= 2) break; continue; }
        if (fence !== 1) continue;
        const tags = line.match(/<[A-Za-z/][^>]*>/g);
        if (tags) offenders.push(`org-skills/${dir}: ${tags.join(' ')}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `XML-like tags in frontmatter — use [brackets]:\n${offenders.join('\n')}`);
});

test('org-skills/mc is a Chat/Cowork pack, not a second plugin skill dir', () => {
  const orgMc = join(repoRoot, 'org-skills', 'mc', 'SKILL.md');
  assert.ok(existsSync(orgMc), 'org-skills/mc/SKILL.md missing — Chat/Cowork /mc zip source');
  const fields = parseFrontmatter(readFileSync(orgMc, 'utf8'));
  assert.equal(fields.name, 'mc', 'org skill name must match the folder (uploader uses the folder)');
  assert.ok(fields.description && fields.description.length > 0);
  assert.ok(
    !existsSync(join(pluginRoot, 'org-skills')),
    'do not nest org-skills inside the plugin — that dual-ships into Claude Code',
  );
});

test('no skill file carries a literal secret', () => {
  // These skills are distributed org-wide (plugin "Installed by default") and now also as
  // standalone organization skills, so a committed credential would reach everyone. The
  // discipline the skills already state — "read from the env var at runtime, NEVER write
  // the literal into any file" — is asserted here rather than trusted.
  const skillsDir = join(pluginRoot, 'skills');
  const bad = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(md|mjs|js|json|sh)$/.test(e)) continue;
      const txt = readFileSync(full, 'utf8');
      // Bearer/JWT/provider-prefixed tokens are unambiguous — no literal form is legitimate.
      for (const re of [/eyJ[A-Za-z0-9_-]{20,}\./g, /\bsk-[A-Za-z0-9]{20,}/g, /\bxox[bpas]-[A-Za-z0-9-]{20,}/g]) {
        const m = txt.match(re);
        if (m) bad.push(`${full}: ${m[0].slice(0, 12)}…`);
      }
      // An assignment of a password/secret/key to a quoted literal.
      const assign = txt.match(/\b(PASSWORD|PASSWD|SECRET|API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|SERVICE_ROLE_KEY)\s*[:=]\s*["'][^"'\s${}]{8,}["']/g);
      if (assign) bad.push(`${full}: ${assign[0].slice(0, 40)}…`);
    }
  };
  walk(skillsDir);
  assert.deepEqual(bad, [], `literal secrets found in distributed skills:\n${bad.join('\n')}`);
});

test('video tooling paths are channel-agnostic (CLAUDE_PLUGIN_ROOT is plugin-only)', () => {
  // ${CLAUDE_PLUGIN_ROOT} is defined ONLY in the plugin channel. Uploaded as a standalone
  // organization skill it expands to nothing, silently turning all 8 tooling paths into
  // absolute paths that don't exist. Paths are skill-relative; the variable may appear
  // only inside the §0.1 explainer that tells you how to resolve it per channel.
  const md = readFileSync(join(pluginRoot, 'skills', 'video', 'SKILL.md'), 'utf8');
  assert.match(md, /Resolving `<skill>\/`/, 'video must explain how to resolve <skill>/');
  assert.ok(md.includes('<skill>/tooling/'), 'tooling paths must be skill-relative');
  const explainer = md.slice(md.indexOf('### §0.1'), md.indexOf('### §0.1') + 1200);
  const total = (md.match(/\$\{CLAUDE_PLUGIN_ROOT\}/g) || []).length;
  const inExplainer = (explainer.match(/\$\{CLAUDE_PLUGIN_ROOT\}/g) || []).length;
  assert.equal(
    total, inExplainer,
    `${total - inExplainer} \${CLAUDE_PLUGIN_ROOT} reference(s) outside the §0.1 explainer — those break as an org skill`,
  );
});

test('video gates on prerequisites before spending its ~20.7k on-invoke budget', () => {
  // video ships in the plugin, which is "Installed by default" org-wide — so every
  // teammate has it, while it actually needs the app repo checked out and runnable,
  // demo seed data, ffmpeg + Playwright, and ElevenLabs/Vimeo creds. It is the single
  // most expensive skill here to invoke (~20.7k tokens), so an unrunnable invoke must
  // bail in the first exchange, not 20k deep. It stays in the plugin deliberately:
  // ${CLAUDE_PLUGIN_ROOT} resolves there, so it genuinely works for whoever does capture.
  const md = readFileSync(join(pluginRoot, 'skills', 'video', 'SKILL.md'), 'utf8');
  assert.ok(md.includes('<!-- BEGIN prereq-gate'), 'video/SKILL.md lost its prerequisites gate');
  assert.ok(md.includes('<!-- END prereq-gate -->'), 'video prereq-gate is unterminated');
  const gateAt = md.indexOf('BEGIN prereq-gate');
  // Must precede the flow-config machinery, or the skill has already started working.
  const configAt = md.indexOf('flow config');
  assert.ok(gateAt > 0 && configAt > 0 && gateAt < configAt, 'gate must precede the flow-config section');
  // Must offer a real alternative rather than dead-ending a teammate who cannot run it.
  assert.match(md, /\/deck/, 'gate should redirect to /deck');
  assert.match(md, /\/customer-brief/, 'gate should redirect to /customer-brief');
  // Installing tooling is fine; a missing app checkout is the hard stop. Both must appear.
  assert.match(md, /winget install Gyan\.FFmpeg/, 'must give a Windows ffmpeg install');
  assert.match(md, /brew install ffmpeg/, 'must give a macOS ffmpeg install');
});

test('dev-setup covers Windows AND macOS, and establishes the OS before instructing', () => {
  // Moth+Flame is a mixed Mac/Windows team. This skill shipped Mac-only (Homebrew,
  // Command+Space, ~/.zprofile) while describing itself as generic setup, so a Windows
  // teammate invoking it got a command that cannot work and no way to know why.
  // Handing someone the wrong OS's steps is worse than handing them none.
  const md = readFileSync(join(pluginRoot, 'skills', 'dev-setup', 'SKILL.md'), 'utf8');
  assert.match(md, /winget install --id Git\.Git/, 'must give the Windows install command');
  assert.match(md, /git-scm\.com\/download\/win/, 'must give a Windows fallback for machines without winget');
  assert.match(md, /brew install git/, 'must still give the macOS install command');
  // OS detection has to come BEFORE either track, or the branch is decorative.
  const osStep = md.indexOf('Find out which computer they');
  assert.ok(osStep > 0, 'must have an explicit OS-detection step');
  assert.ok(osStep < md.indexOf('winget install'), 'OS detection must precede the Windows track');
  assert.ok(osStep < md.indexOf('brew install git'), 'OS detection must precede the macOS track');
  // The frontmatter must not advertise it as Mac-only, or Windows users never reach it.
  const fm = md.slice(0, md.indexOf('---', 3));
  assert.match(fm, /Windows/i, 'frontmatter must mention Windows so it triggers for PC users');
});

test('preflight demands a test runner only where the skill actually runs one', () => {
  // plan and audit change no code and run no tests — demanding a suite there would send
  // people away for a prerequisite the skill never uses.
  for (const s of ['build', 'test', 'fix']) {
    const md = readFileSync(join(pluginRoot, 'skills', s, 'SKILL.md'), 'utf8');
    assert.match(md, /test runner you can actually execute/, `${s}: must require a runnable test suite`);
  }
  for (const s of ['plan', 'audit']) {
    const md = readFileSync(join(pluginRoot, 'skills', s, 'SKILL.md'), 'utf8');
    const pre = md.slice(
      md.indexOf('<!-- BEGIN desktop-preflight'),
      md.indexOf('<!-- END desktop-preflight -->'),
    );
    assert.ok(
      !/test runner you can actually execute/.test(pre),
      `${s}: must NOT require a test suite — it runs no tests`,
    );
  }
});
