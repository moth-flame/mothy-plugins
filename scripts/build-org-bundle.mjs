#!/usr/bin/env node
/**
 * build-org-bundle.mjs — generate the Organization Skills upload from the plugin.
 *
 * WHY THIS EXISTS. Two surfaces, one source of truth: the plugin serves Claude
 * Code, Org Skills serve Chat/Cowork. Uploading skills by hand creates a second
 * executable copy that nothing in `tests/` can see, and drift between them is
 * invisible at the moment it matters — the org copy runs, misbehaves, and looks
 * exactly like the plugin working. So the org bundle is GENERATED, from git,
 * and pinned by tests/org-bundle.test.mjs. Never edit an uploaded skill in the
 * org UI; edit the plugin and re-run this.
 *
 * WHAT THE ORG SURFACE CANNOT DO, and why the bundle is a subset:
 *   - no hooks           → nothing that promises PreCompact capture, the
 *                          question-widget policy, or the pre-push arming
 *   - no command shims   → no bare `/deck`; the skill is matched by description
 *   - no repo, no binaries → nothing gated on a runnable test suite, a git
 *                          checkout, Playwright/ffmpeg/ElevenLabs, or the CLI
 *
 * Two skills earn a SURFACE VARIANT rather than exclusion, because the
 * discipline in them is worth more on a surface with no safety net:
 *   - proceed → keeps park/resume; the hook section is replaced by an explicit
 *               "no automatic capture here", because those sentences are false
 *               on this surface and a false promise is worse than a gap.
 *   - plan    → keeps independent role passes, the conformance cross-check and
 *               synthesis; drops the repo preflight and the Workflow script.
 *
 * ANCHORS ARE STRICT ON PURPOSE. Every cut asserts its anchor appears exactly
 * once and THROWS otherwise. A forgiving builder would quietly emit a variant
 * that still carries the hook promise after someone renames a heading — the
 * upload would look fine and the lie would be back. Fail the build instead.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = join(ROOT, 'plugins', 'mothy', 'skills');
const OUT_DIR = join(ROOT, 'dist', 'org-skills');

/** Plugin-only, with the reason stated so nobody re-litigates it from memory. */
export const EXCLUDED = {
  video: 'drives Playwright + ffmpeg + ElevenLabs against a local checkout',
  article: 'consumes the per-step artifacts a local /video run captured',
  'video-setup': 'checks local credential files and binaries',
  build: 'gates on red-green against a runnable suite in a checked-out repo',
  fix: 'reproduces a bug as a failing test in a checked-out repo',
  test: 'its whole purpose is making a real green suite mean something',
  audit: 'cites file:line from a checkout it must be able to read',
  connect: 'first-run setup for the Claude Code plugin surface itself',
  'dev-setup': 'installs Homebrew and Git on a Mac',
  'update-skills': 'coaches terminal commands for the Claude Code plugin cache',
};

const banner = (version) =>
  `> **Organization Skills copy — generated from the mothy plugin v${version}.** ` +
  `Do not edit this here: edit the plugin skill in \`mothy-plugins\` and re-run ` +
  `\`node scripts/build-org-bundle.mjs\`. Edits made in the org UI are overwritten ` +
  `by the next sync and are invisible to the repo's tests.\n`;

/** Cut [from, to) and put `replacement` in its place. Both anchors must be unique. */
const cut = (src, from, to, replacement, skill) => {
  for (const [label, anchor] of [['start', from], ['end', to]]) {
    const n = src.split(anchor).length - 1;
    if (n !== 1) {
      throw new Error(
        `${skill}: ${label} anchor appears ${n} times, expected exactly once — ` +
        `"${anchor.slice(0, 60)}". The plugin skill was edited without updating ` +
        `this transform; fix the anchor rather than shipping an unchecked variant.`
      );
    }
  }
  const a = src.indexOf(from);
  const b = src.indexOf(to);
  if (b < a) throw new Error(`${skill}: anchors are out of order — the transform is stale.`);
  return src.slice(0, a) + replacement + src.slice(b);
};

const PROCEED_NO_HOOKS = `### There is no automatic capture on this surface — parking is manual

In Claude Code the Mothy plugin ships hooks that snapshot state and recover the
reasoning behind it whenever a compaction fires, so an unparked session still
lands somewhere. **Organization Skills carry no hooks, so none of that runs
here.** Nothing is watching for the right moment, and nothing writes a file you
can resume from.

That makes §1 more important here, not less: on this surface the park you do by
hand is the only park there is. Park at seams, and write the record into a
document the next session can actually open — not into the reply.

`;

const PLAN_ORG_HEADER = `> **Runs anywhere — no repository required.** This copy is for Chat/Cowork,
> where there may be no checkout, no test runner and no parallel sub-agents. Plan
> non-code decisions with it freely. When the topic *is* code and you cannot read
> the repo, say plainly which parts of the plan are unverified rather than
> guessing at file layout or commands.

`;

const PLAN_SEQUENTIAL = `**One shape on this surface: sequential.** Run the role passes one at a time in
a single session — there are no parallel sub-agents here, and none are needed.

`;

/** name → transform. Absent transform = verbatim (banner only). */
export const ORG_BUNDLE = {
  // Product skills — prose and data, fully executable on the org surface.
  'customer-brief': null,
  deck: null,
  'edit-in-place': null,
  onboard: null,
  'idea-intake': null,
  prd: null,
  'pr-faq': null,
  'process-navigator': null,
  mc: null,
  evals: null,

  // Surface variants.
  proceed: (src) => cut(
    src,
    '### It is automatic — you do not have to remember (installed with this plugin)',
    '---\n\n## §4 — Anti-patterns',
    PROCEED_NO_HOOKS,
    'proceed'
  ),

  plan: (src) => {
    let out = cut(src, '<!-- BEGIN desktop-preflight', '> **Repo-agnostic and OS-agnostic.**',
                  PLAN_ORG_HEADER, 'plan');
    out = cut(out, '## Orchestration boilerplate (illustrative)', '## Rules', '', 'plan');
    return cut(out, '**Preferred when the harness supports it:**', '**Fallback when it does not:**',
               PLAN_SEQUENTIAL, 'plan');
  },
};

export function buildOrgSkill(name, src, version) {
  if (!(name in ORG_BUNDLE)) {
    throw new Error(`${name} is not in the org bundle (${EXCLUDED[name] ?? 'not a known skill'})`);
  }
  const transform = ORG_BUNDLE[name];
  const body = transform ? transform(src) : src;

  // Stamp goes immediately after the frontmatter so it survives any later cut.
  const end = body.indexOf('\n---\n', body.indexOf('---') + 3);
  if (end === -1) throw new Error(`${name}: no frontmatter to stamp beneath`);
  const at = end + '\n---\n'.length;
  return body.slice(0, at) + '\n' + banner(version) + body.slice(at);
}

function main() {
  const version = JSON.parse(
    readFileSync(join(ROOT, 'plugins', 'mothy', '.claude-plugin', 'plugin.json'), 'utf8')
  ).version;

  rmSync(OUT_DIR, { recursive: true, force: true });
  for (const name of Object.keys(ORG_BUNDLE)) {
    const from = join(SKILLS_DIR, name);
    const to = join(OUT_DIR, name);
    mkdirSync(to, { recursive: true });
    writeFileSync(
      join(to, 'SKILL.md'),
      buildOrgSkill(name, readFileSync(join(from, 'SKILL.md'), 'utf8'), version)
    );
    // Supporting files ride along untouched.
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (entry.name === 'SKILL.md') continue;
      cpSync(join(from, entry.name), join(to, entry.name), { recursive: true });
    }
    console.log(`built ${name}${ORG_BUNDLE[name] ? ' (surface variant)' : ''}`);
  }
  console.log(`\n${Object.keys(ORG_BUNDLE).length} skills → ${OUT_DIR} (from v${version})`);
  console.log('Upload that directory to Organization Skills. Never edit them there.');
}

if (process.argv[1] && existsSync(process.argv[1]) &&
    import.meta.url === `file://${process.argv[1]}`) main();
