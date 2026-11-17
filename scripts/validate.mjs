#!/usr/bin/env node
// Structural checks for skills, manifests, hooks, evaluation rubrics and local links.
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSuite } from './evaluate.mjs';
import { inspectCodexHooks } from './hook-check.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const kebab = (value) => typeof value === 'string' && value.length <= 64 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
const nonempty = (value) => typeof value === 'string' && Boolean(value.trim());

function within(root, path) {
  const part = relative(root, path);
  return !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`);
}

const stripFences = (text) => text.replace(/^\s*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '');

// Only one scalar per YAML line is supported here.
export function frontmatter(text) {
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const match = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) {
    return { data: {}, body: text, errors: ['missing or unclosed frontmatter'] };
  }

  const data = {};
  const errors = [];
  for (const line of match[1].split('\n')) {
    if (!line.trim() || /^\s*#/.test(line)) {
      continue;
    }
    const field = line.match(/^([a-z][\w-]*):\s*(.*?)\s*$/);
    if (!field) {
      errors.push(`unsupported frontmatter line: ${line}`);
      continue;
    }
    const [, key, raw] = field;
    if (Object.hasOwn(data, key)) {
      errors.push(`duplicate frontmatter key "${key}"`);
    }
    if (/^[>|[\]{&*!]/.test(raw) || /^-\s/.test(raw)) {
      errors.push(`"${key}" must use a one-line scalar`);
      continue;
    }

    let value = raw;
    if (raw.startsWith('"')) {
      try {
        value = JSON.parse(raw);
        if (typeof value !== 'string') {
          throw new Error();
        }
      } catch {
        errors.push(`invalid quoted value for "${key}"`);
        continue;
      }
    } else if (raw.startsWith("'")) {
      if (!/^'(?:[^']|'')*'$/.test(raw)) {
        errors.push(`invalid quoted value for "${key}"`);
        continue;
      }
      value = raw.slice(1, -1).replace(/''/g, "'");
    } else if (/:\s|\s#/.test(raw)) {
      errors.push(`quote "${key}" to avoid ambiguous YAML punctuation`);
      continue;
    }
    data[key] = value;
  }
  return { data, body: text.slice(match[0].length), errors };
}

function headingAnchors(text) {
  const used = new Set();
  const anchors = new Set();
  for (const match of stripFences(text).matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const slug = match[1]
      .replace(/<[^>]*>/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}_\-\s]/gu, '')
      .replace(/\s/g, '-');
    let candidate = slug;
    let suffix = 0;
    while (used.has(candidate)) {
      candidate = `${slug}-${++suffix}`;
    }
    used.add(candidate);
    anchors.add(candidate);
  }
  for (const match of text.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) {
    anchors.add(match[1]);
  }
  return anchors;
}

export function validateToolkit(inputRoot = defaultRoot) {
  const root = realpathSync.native(resolve(inputRoot));
  const errors = [];
  const fail = (message) => errors.push(message);
  const rel = (path) => relative(root, path).split(sep).join('/');

  function regular(path) {
    try {
      const stat = lstatSync(path);
      return stat.isFile() && !stat.isSymbolicLink() && within(root, realpathSync.native(path));
    } catch {
      return false;
    }
  }

  function read(path) {
    if (!regular(path)) {
      fail(`${rel(path)}: missing, linked or non-regular file`);
      return '';
    }
    return readFileSync(path, 'utf8').replace(/\r\n?/g, '\n');
  }

  function readJson(path) {
    const text = read(path);
    if (!text.trim()) {
      fail(`${rel(path)}: invalid JSON (empty file)`);
      return null;
    }
    try {
      const result = JSON.parse(text);
      if (!result || typeof result !== 'object' || Array.isArray(result)) {
        throw new Error('expected an object');
      }
      return result;
    } catch (error) {
      fail(`${rel(path)}: invalid JSON (${error.message})`);
      return null;
    }
  }

  function entries(path) {
    try {
      if (lstatSync(path).isSymbolicLink() || !within(root, realpathSync.native(path))) {
        throw new Error('linked directory');
      }
      return readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
    } catch {
      fail(`${rel(path) || '.'}: missing, linked or unreadable directory`);
      return [];
    }
  }

  function metadata(file) {
    const parsed = frontmatter(read(file));
    for (const error of parsed.errors) {
      fail(`${rel(file)}: ${error}`);
    }
    return parsed;
  }

  const skills = [];
  for (const entry of entries(join(root, 'skills'))) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      fail(`skills/${entry.name}: expected a regular skill directory`);
      continue;
    }
    const name = entry.name;
    skills.push(name);
    const file = join(root, 'skills', name, 'SKILL.md');
    const { data, body } = metadata(file);
    if (!kebab(name)) {
      fail(`${rel(file)}: name must be kebab-case, max 64 characters`);
    }
    if (data.name !== name) {
      fail(`${rel(file)}: name must equal directory "${name}"`);
    }
    const description = data.description ?? '';
    if (description.length < 40 || description.length > 400) {
      fail(`${rel(file)}: description must have 40 to 400 characters`);
    }
    if (!/^Use when\b/.test(description)) {
      fail(`${rel(file)}: description must start with "Use when"`);
    }
    if (body.trimEnd().split('\n').length > 120) {
      fail(`${rel(file)}: keep the skill body under 120 lines`);
    }
    if (!/^#\s+\S/m.test(body)) {
      fail(`${rel(file)}: missing top-level heading`);
    }
  }
  if (!skills.length) {
    fail('skills/: no skills found');
  }
  if (!skills.includes('start-here')) {
    fail('skills/: missing start-here router');
  }

  const componentSpecs = [
    ['agents', ['name', 'description', 'tools']],
    ['commands', ['description']],
  ];
  for (const [directory, required] of componentSpecs) {
    for (const entry of entries(join(root, directory))) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        fail(`${directory}/${entry.name}: expected a Markdown file`);
        continue;
      }
      const file = join(root, directory, entry.name);
      const { data, body } = metadata(file);
      for (const field of required) {
        if (!data[field]) {
          fail(`${rel(file)}: missing "${field}"`);
        }
      }
      if (directory === 'agents' && (!kebab(data.name) || `${data.name}.md` !== entry.name)) {
        fail(`${rel(file)}: name must match the kebab-case filename`);
      }
      if (!body.trim()) {
        fail(`${rel(file)}: empty instruction body`);
      }
    }
  }

  const pkg = readJson(join(root, 'package.json'));
  const plugin = readJson(join(root, '.claude-plugin/plugin.json'));
  if (plugin) {
    for (const field of ['name', 'version', 'description', 'license']) {
      if (typeof plugin[field] !== 'string' || !plugin[field].trim()) {
        fail(`plugin.json: missing or invalid "${field}"`);
      }
    }
    if (!kebab(plugin.name)) {
      fail('plugin.json: invalid plugin name');
    }
    if (!/^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/.test(plugin.version ?? '')) {
      fail('plugin.json: invalid semantic version');
    }
    if (pkg && (plugin.version !== pkg.version || plugin.name !== pkg.name)) {
      fail('plugin.json: name/version differ from package.json');
    }
    if (plugin.author && !nonempty(plugin.author.name)) {
      fail('plugin.json: author must have a name');
    }
    if (/YOUR_(?:NAME|ORG)|your-username|your-org/i.test(JSON.stringify(plugin))) {
      fail('plugin.json: unresolved publication placeholder');
    }
  }

  if (pkg?.scripts?.['hook-check'] || existsSync(join(root, 'plugin.json')) || existsSync(join(root, '.codex-plugin/plugin.json'))) {
    try {
      inspectCodexHooks(root);
    } catch (error) {
      fail(`Codex hook package: ${error.message}`);
    }
  }

  if (pkg) {
    if (!/^>=20(?:\.0(?:\.0)?)?$/.test(pkg.engines?.node ?? '')) {
      fail('package.json: engines.node must declare >=20');
    }
    for (const script of ['validate', 'test', 'check', 'setup', 'doctor', 'evals']) {
      if (typeof pkg.scripts?.[script] !== 'string' || !pkg.scripts[script].trim()) {
        fail(`package.json: missing script "${script}"`);
      }
    }
    for (const command of Object.values(pkg.scripts ?? {})) {
      if (typeof command !== 'string') {
        fail('package.json: script commands must be strings');
        continue;
      }
      for (const match of command.matchAll(/\bscripts\/[\w/.-]+\.mjs\b/g)) {
        if (!regular(resolve(root, match[0]))) {
          fail(`package.json: script does not exist: ${match[0]}`);
        }
      }
    }
    if (pkg.bin && (typeof pkg.bin !== 'object' || Array.isArray(pkg.bin))) {
      fail('package.json: bin must map command names to local files');
    } else if (pkg.bin) {
      for (const [cmd, target] of Object.entries(pkg.bin)) {
        if (typeof target !== 'string' || !target.trim()) {
          fail(`package.json: bin "${cmd}" must point to a local script`);
          continue;
        }
        const resolved = resolve(root, target);
        if (!within(root, resolved) || !regular(resolved)) {
          fail(`package.json: bin target does not exist: ${target}`);
        } else if (!read(resolved).startsWith('#!/usr/bin/env node')) {
          fail(`package.json: bin target missing node shebang: ${target}`);
        }
      }
    }
  }

  const market = readJson(join(root, '.claude-plugin/marketplace.json'));
  if (market) {
    if (!kebab(market.name) || !nonempty(market.owner?.name)) {
      fail('marketplace.json: name and owner.name are required');
    }
    if (/YOUR_(?:NAME|ORG)|your-username|your-org/i.test(JSON.stringify(market))) {
      fail('marketplace.json: unresolved publication placeholder');
    }
    if (!Array.isArray(market.plugins) || !market.plugins.length) {
      fail('marketplace.json: plugins must be a nonempty array');
    } else {
      const names = new Set();
      for (const item of market.plugins) {
        if (!item || !kebab(item.name) || names.has(item.name)) {
          fail('marketplace.json: invalid or duplicate plugin name');
        }
        names.add(item?.name);
      }
      if (!market.plugins.some((item) => item && item.name === plugin?.name && item.source === './')) {
        fail('marketplace.json: bundled plugin must reference the local source "./"');
      }
    }
  }

  const hooks = readJson(join(root, 'hooks/hooks.json'));
  const events = new Set([
    'PreToolUse',
    'PostToolUse',
    'PostToolUseFailure',
    'PermissionRequest',
    'UserPromptSubmit',
    'Notification',
    'Stop',
    'SubagentStop',
    'SubagentStart',
    'PreCompact',
    'SessionStart',
    'SessionEnd',
    'Setup',
    'TeammateIdle',
    'TaskCompleted',
    'ConfigChange',
    'WorktreeCreate',
    'WorktreeRemove',
  ]);
  if (hooks) {
    if (!hooks.hooks || typeof hooks.hooks !== 'object' || Array.isArray(hooks.hooks) || !Object.keys(hooks.hooks).length) {
      fail('hooks.json: missing nonempty hooks object');
    } else {
      for (const [event, groups] of Object.entries(hooks.hooks)) {
        if (!events.has(event)) {
          fail(`hooks.json: unknown event ${event}`);
        }
        if (!Array.isArray(groups) || !groups.length) {
          fail(`hooks.json: ${event} must contain hook groups`);
          continue;
        }
        for (const group of groups) {
          if (!group || typeof group !== 'object' || typeof group.matcher !== 'string' || !group.matcher) {
            fail(`hooks.json: ${event} requires a matcher`);
          }
          if (!Array.isArray(group?.hooks) || !group.hooks.length) {
            fail(`hooks.json: ${event} requires hooks`);
            continue;
          }
          for (const hook of group.hooks) {
            if (hook?.type !== 'command' || typeof hook.command !== 'string') {
              fail('hooks.json: expected a command hook');
              continue;
            }
            const match = hook.command.match(/^node\s+"\$\{CLAUDE_PLUGIN_ROOT\}\/([\w/.-]+\.mjs)"$/);
            if (!match || !within(root, resolve(root, match[1])) || !regular(resolve(root, match[1]))) {
              fail('hooks.json: command must run one existing local Node script using ${CLAUDE_PLUGIN_ROOT}');
            }
            if (hook.async === true && event === 'PreToolUse') {
              fail('hooks.json: safety gates must not run asynchronously');
            }
            if (hook.timeout !== undefined && (!Number.isInteger(hook.timeout) || hook.timeout <= 0)) {
              fail('hooks.json: timeout must be a positive integer');
            }
          }
        }
      }
    }
  }

  const router = read(join(root, 'skills/start-here/SKILL.md'));
  const scenarios = read(join(root, 'evals/scenarios.md'));
  const suite = readJson(join(root, 'evals/cases.json'));
  if (suite) {
    try {
      validateSuite(suite);
      const covered = new Set();
      for (const item of suite.cases) {
        for (const skill of item.skills) {
          if (!skills.includes(skill)) {
            fail(`evals/cases.json: unknown skill "${skill}" in ${item.id}`);
          }
          covered.add(skill);
        }
      }
      for (const skill of skills) {
        if (!covered.has(skill)) {
          fail(`evals/cases.json: no case covers "${skill}"`);
        }
      }
    } catch (error) {
      fail(`evals/cases.json: ${error.message}`);
    }
  }

  const scenarioSections = scenarios.split(/^##\s+/m).slice(1);
  for (const skill of skills) {
    if (skill !== 'start-here' && !router.includes('`' + skill + '`')) {
      fail(`start-here: does not route to "${skill}"`);
    }
    const section = scenarioSections.find((item) => item.split('\n')[0].includes('`' + skill + '`'));
    if (!section) {
      fail(`evals/scenarios.md: missing scenario heading for "${skill}"`);
    } else {
      for (const field of ['Prompt', 'Pass', 'Fail']) {
        if (!section.includes(`**${field}:**`)) {
          fail(`evals/scenarios.md: "${skill}" scenario missing ${field}`);
        }
      }
    }
  }

  const markdown = [];
  function walk(directory) {
    for (const entry of entries(directory)) {
      if (['.git', 'node_modules', '.agents', '.claude', '.llmkit'].includes(entry.name)) {
        continue;
      }
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        fail(`${rel(path)}: linked source is not portable`);
        continue;
      }
      if (entry.isDirectory()) {
        walk(path);
      } else if (entry.name.endsWith('.md') || entry.name.endsWith('.md.template')) {
        markdown.push(path);
      }
    }
  }
  walk(root);

  const anchorCache = new Map();
  for (const file of markdown) {
    const text = stripFences(read(file)).replace(/`[^`\n]*`/g, '');
    const targets = [
      ...text.matchAll(/\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^\n]*?["'])?\s*\)/g),
      ...text.matchAll(/^\s*\[[^\]]+\]:\s*(<[^>]+>|\S+)/gm),
    ];
    for (const match of targets) {
      const target = match[1].replace(/^<|>$/g, '');
      if (/^[a-z][a-z\d+.-]*:/i.test(target)) {
        continue;
      }
      let pathPart;
      let anchor;
      try {
        [pathPart, anchor] = target.split('#').map(decodeURIComponent);
      } catch {
        fail(`${rel(file)}: malformed link ${target}`);
        continue;
      }
      const destination = pathPart ? resolve(dirname(file), pathPart) : file;
      if (!within(root, destination) || !existsSync(destination) || !within(root, realpathSync.native(destination))) {
        fail(`${rel(file)}: broken or external local link ${target}`);
        continue;
      }
      if (anchor && /\.md$/i.test(destination) && regular(destination)) {
        if (!anchorCache.has(destination)) {
          anchorCache.set(destination, headingAnchors(read(destination)));
        }
        if (!anchorCache.get(destination).has(anchor)) {
          fail(`${rel(file)}: missing link anchor ${target}`);
        }
      }
    }
  }
  return { errors, skills, markdownFiles: markdown.length };
}

const isDirectRun = (url) => {
  try {
    return Boolean(process.argv[1]) && realpathSync.native(resolve(process.argv[1])) === realpathSync.native(fileURLToPath(url));
  } catch {
    return false;
  }
};

if (isDirectRun(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && !(args.length === 2 && args[0] === '--root')) {
      throw new Error('Usage: node scripts/validate.mjs [--root <toolkit-directory>]');
    }
    const result = validateToolkit(args[1] ?? defaultRoot);
    if (result.errors.length) {
      console.error(`validate: ${result.errors.length} problem(s)\n${result.errors.map((error) => ` - ${error}`).join('\n')}`);
      process.exitCode = 1;
    } else {
      console.log(`validate: ok (${result.skills.length} skills; ${result.markdownFiles} Markdown files)`);
    }
  } catch (error) {
    console.error(`validate: ${error.message}`);
    process.exitCode = 1;
  }
}
