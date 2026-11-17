import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { frontmatter, validateToolkit } from './validate.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'llmkit-validate-'));
  t.after(() => {
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
    rmSync(root, { recursive: true, force: true });
  });
  const write = (path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content));
  };
  const skill = (name, body = '# Example\n\nA useful workflow.\n') => `---\nname: ${name}\ndescription: Use when a task starts and a workflow needs to be chosen.\n---\n\n${body}`;
  write('skills/start-here/SKILL.md', skill('start-here'));
  mkdirSync(join(root, 'agents'));
  mkdirSync(join(root, 'commands'));
  write('package.json', {
    name: 'llmkit', version: '1.0.0', engines: { node: '>=20' },
    scripts: Object.fromEntries(['validate', 'test', 'check', 'setup', 'doctor', 'evals'].map((key) => [key, 'node scripts/example.mjs'])),
  });
  write('scripts/example.mjs', '// fixture\n');
  write('.claude-plugin/plugin.json', { name: 'llmkit', version: '1.0.0', description: 'Example toolkit', license: 'MIT' });
  write('.claude-plugin/marketplace.json', { name: 'llmkit', owner: { name: 'Maintainers' }, plugins: [{ name: 'llmkit', source: './' }] });
  write('hooks/hooks.json', { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/example.mjs"' }] }] } });
  write('evals/scenarios.md', '# Scenarios\n\n## Start (`start-here`)\n\n- **Prompt:** Start.\n- **Pass:** Routes.\n- **Fail:** Does not route.\n');
  write('evals/cases.json', { version: 1, cases: [{ id: 'start', skills: ['start-here'], setup: 'Fresh session.', prompt: 'Start.', criteria: [{ id: 'routes', text: 'Routes to workflow.', critical: true }] }] });
  return { root, write, skill, errors: () => validateToolkit(root).errors };
}

test('valid minimal toolkit has no validation errors', (t) => {
  assert.deepEqual(fixture(t).errors(), []);
});

test('metadata parser accepts quoted scalars and CRLF but rejects duplicates and unsupported YAML', () => {
  const parsed = frontmatter('\uFEFF---\r\nname: "example"\r\ndescription: \'Use when it is needed.\'\r\n---\r\n# Body\r\n');
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.data.name, 'example');
  assert.equal(parsed.data.description, 'Use when it is needed.');
  assert.match(frontmatter('---\nname: x\nname: y\n---\n# Body').errors.join('\n'), /duplicate/);
  assert.match(frontmatter('---\nname: x\ndescription: >\n  text\n---\n# Body').errors.join('\n'), /one-line scalar|unsupported/);
  assert.match(frontmatter('---\nname: "unterminated\n---\n# Body').errors.join('\n'), /invalid quoted/);
  assert.match(frontmatter('---\ndescription: Use when testing: unsafe punctuation\n---\n# Body').errors.join('\n'), /ambiguous YAML/);
});

test('new skills require consistent metadata, a router entry and a scored behavior scenario', (t) => {
  const f = fixture(t);
  f.write('skills/bad--name/SKILL.md', f.skill('different', '# Example\n' + 'line\n'.repeat(121)));
  const errors = f.errors().join('\n');
  assert.match(errors, /kebab-case/);
  assert.match(errors, /name must equal/);
  assert.match(errors, /under 120/);
  assert.match(errors, /does not route/);
  assert.match(errors, /missing scenario/);
  assert.match(errors, /no case covers/);
});

test('links check decoded paths, reference definitions and anchors, while ignoring code examples', (t) => {
  const f = fixture(t);
  f.write('docs/with space.md', '# A heading\n\n## Duplicate\n\n## Duplicate\n');
  f.write('README.md', '# Home\n\n[valid](docs/with%20space.md#a-heading)\n\n[duplicate](<docs/with space.md#duplicate-1>)\n\n[missing anchor](docs/with%20space.md#nope)\n\n[reference][bad]\n\n[bad]: missing.md\n\n```md\n[example](also-missing.md)\n```\n\n`[inline](ignored.md)`\n');
  const errors = f.errors();
  assert.equal(errors.length, 2, errors.join('\n'));
  assert.match(errors.join('\n'), /missing link anchor.*#nope/);
  assert.match(errors.join('\n'), /broken.*missing.md/);
  assert.ok(!errors.some((error) => error.includes('also-missing') || error.includes('ignored')));
});

test('malformed manifests and empty hook maps cannot validate', (t) => {
  const f = fixture(t);
  f.write('.claude-plugin/plugin.json', { name: 'llmkit', version: 'broken', description: '', license: 'MIT', author: { name: 12 } });
  f.write('.claude-plugin/marketplace.json', { name: 'llmkit', owner: { name: 12 }, plugins: [null] });
  f.write('hooks/hooks.json', { hooks: {} });
  const errors = f.errors().join('\n');
  assert.match(errors, /invalid semantic version/);
  assert.match(errors, /missing or invalid "description"/);
  assert.match(errors, /author must have a name/);
  assert.match(errors, /owner.name/);
  assert.match(errors, /invalid or duplicate plugin/);
  assert.match(errors, /nonempty hooks object/);
});

test('empty JSON files never count as valid manifests, hook configuration or evaluation suites', (t) => {
  const f = fixture(t);
  for (const file of ['package.json', '.claude-plugin/plugin.json', '.claude-plugin/marketplace.json', 'hooks/hooks.json', 'evals/cases.json']) f.write(file, '  \n');
  const errors = f.errors();
  assert.equal(errors.filter((error) => /invalid JSON \(empty file\)/.test(error)).length, 5);
});

test('hook commands reject traversal, shell suffixes, missing scripts and asynchronous gates', (t) => {
  const f = fixture(t);
  f.write('hooks/hooks.json', { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [
    { type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/../outside.mjs"' },
    { type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/example.mjs" && echo bypass' },
    { type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/missing.mjs"' },
    { type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/scripts/example.mjs"', async: true },
  ] }] } });
  const errors = f.errors();
  assert.equal(errors.filter((error) => /one existing local Node script/.test(error)).length, 3);
  assert.ok(errors.some((error) => /asynchronously/.test(error)));
});

test('invalid suite rubric and unknown skills are rejected', (t) => {
  const f = fixture(t);
  f.write('evals/cases.json', { version: 1, cases: [{ id: 'unknown', skills: ['unknown'], setup: 'Setup.', prompt: 'Prompt.', criteria: [{ id: 'evidence', text: 'Check.', critical: true }] }] });
  assert.match(f.errors().join('\n'), /unknown skill "unknown"/);
  f.write('evals/cases.json', { version: 1, cases: [{ id: 'bad' }] });
  assert.match(f.errors().join('\n'), /skills required/);
});

test('missing directories produce actionable errors rather than an uncaught exception', (t) => {
  const f = fixture(t);
  const path = resolve(f.root, 'skills');
  assert.ok(path.startsWith(resolve(f.root) + sep));
  rmSync(path, { recursive: true, force: true });
  assert.match(f.errors().join('\n'), /skills: missing.*directory/);
});

test('package bin entries must stay inside the root, exist and start with a node shebang', (t) => {
  const f = fixture(t);
  f.write('scripts/cli.mjs', '#!/usr/bin/env node\n');
  f.write('scripts/no-shebang.mjs', '// missing shebang\n');
  f.write('package.json', {
    name: 'llmkit', version: '1.0.0', engines: { node: '>=20' },
    bin: {
      ok: 'scripts/cli.mjs',
      missing: 'scripts/missing.mjs',
      outside: '../outside.mjs',
      plain: 'scripts/no-shebang.mjs',
    },
    scripts: Object.fromEntries(['validate', 'test', 'check', 'setup', 'doctor', 'evals'].map((key) => [key, 'node scripts/example.mjs'])),
  });
  const errors = f.errors().join('\n');
  assert.match(errors, /bin target does not exist: scripts\/missing\.mjs/);
  assert.match(errors, /bin target does not exist: \.\.\/outside\.mjs/);
  assert.match(errors, /bin target missing node shebang: scripts\/no-shebang\.mjs/);
  assert.doesNotMatch(errors, /scripts\/cli\.mjs/);
});
