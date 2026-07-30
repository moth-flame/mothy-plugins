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
  'brief',
  'build',
  'connect',
  'deck',
  'fix',
  'onboard',
  'plan',
  'test',
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
