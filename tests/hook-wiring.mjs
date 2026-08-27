/**
 * Single reader for the two hook wiring locations.
 *
 * Claude Code validates `hooks/hooks.json` as `{ hooks: Record<event, matchers> }`.
 * A top-level event map fails load: path ["hooks"], expected record, received
 * undefined. `plugin.json`'s `"hooks"` key already IS that wrapper, so its
 * value is the event map. The two event maps must stay identical; the FILE
 * must keep the extra wrapper.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const HOOKS_JSON_PATH = join(ROOT, 'plugins', 'mothy', 'hooks', 'hooks.json');
export const PLUGIN_JSON_PATH = join(ROOT, 'plugins', 'mothy', '.claude-plugin', 'plugin.json');

const TOP_LEVEL_EVENTS = ['PreCompact', 'SessionStart', 'UserPromptSubmit'];

export function eventsFromHooksFile(doc) {
  if (doc == null || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('hooks.json must parse to an object');
  }
  if (!Object.hasOwn(doc, 'hooks')) {
    throw new Error('hooks.json missing top-level "hooks" wrapper');
  }
  if (typeof doc.hooks !== 'object' || doc.hooks === null || Array.isArray(doc.hooks)) {
    throw new Error('hooks.json "hooks" must be a record of events');
  }
  for (const event of TOP_LEVEL_EVENTS) {
    if (Object.hasOwn(doc, event)) {
      throw new Error(`hooks.json must not declare ${event} at the top level`);
    }
  }
  return doc.hooks;
}

export function readPluginHookEvents() {
  const plugin = JSON.parse(readFileSync(PLUGIN_JSON_PATH, 'utf8'));
  if (!plugin.hooks || typeof plugin.hooks !== 'object' || Array.isArray(plugin.hooks)) {
    throw new Error('plugin.json.hooks missing');
  }
  return plugin.hooks;
}

export function readBothHookEventMaps() {
  const fromFile = eventsFromHooksFile(JSON.parse(readFileSync(HOOKS_JSON_PATH, 'utf8')));
  const fromPlugin = readPluginHookEvents();
  return { fromFile, fromPlugin };
}
