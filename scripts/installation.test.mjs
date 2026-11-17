import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkDestination, createPlan, createUninstallPlan, installPlan, parseOptions, projectRoot, uninstallPlan } from './installation.mjs';

const scripts = dirname(fileURLToPath(import.meta.url));
const run = (script, args, directory = scripts) => spawnSync(process.execPath, [join(directory, script), ...args], { encoding: 'utf8' });
function temporary(t) {
  const root = mkdtempSync(join(tmpdir(), 'llmkit-install-'));
  t.after(() => {
    const location = resolve(root);
    assert.ok(location.startsWith(resolve(tmpdir()) + sep) && location !== resolve(tmpdir()));
    rmSync(location, { recursive: true, force: true });
  });
  return root;
}
function write(root, path, text = 'fixture') {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}
function source(t) {
  const root = temporary(t);
  write(root, 'skills/start-here/SKILL.md', 'start here');
  write(root, 'skills/verify-before-done/SKILL.md', 'verify');
  write(root, 'skills/verify-before-done/references/check.md', 'reference');
  write(root, 'agents/reviewer.md', 'review');
  write(root, 'commands/start.md', 'start');
  return root;
}

test('options require an explicit local project and recognized target', () => {
  assert.throws(() => parseOptions([]), /--project is required/);
  assert.throws(() => parseOptions(['--project', 'x', '--target', 'global']), /--target/);
  assert.throws(() => parseOptions(['--project', 'x', '--project', 'y', '--target', 'codex']), /Duplicate/);
  assert.throws(() => parseOptions(['--force']), /Unknown option/);
  assert.throws(() => parseOptions(['--dry-run'], { doctor: true }), /Unknown option/);
  assert.throws(() => parseOptions(['--update'], { doctor: true }), /Unknown option/);
  assert.throws(() => parseOptions(['--uninstall'], { doctor: true }), /Unknown option/);
  assert.throws(() => parseOptions(['--project', 'x', '--target', 'codex', '--update', '--uninstall']), /cannot be combined/);
  assert.throws(() => parseOptions(['--project', 'x', '--target', 'codex', '--profile', 'core', '--uninstall']), /cannot be combined/);
  assert.throws(() => parseOptions(['--project', 'x', '--target', 'codex', '--profile', 'custom']), /--profile/);
  assert.deepEqual(parseOptions(['--project', 'my project', '--target', 'both', '--dry-run', '--json']), {
    project: 'my project', target: 'both', profile: 'full', dryRun: true, json: true, help: false,
  });
  assert.throws(() => projectRoot(homedir()), /home directory/);
  if (process.platform === 'win32' && !/[&|<>^"]/.test(homedir())) {
    const homeProbe = spawnSync('cmd.exe', ['/d', '/c', `for %I in ("${homedir()}") do @echo %~sI`], { windowsVerbatimArguments: true, encoding: 'utf8' });
    const shortHome = homeProbe.stdout?.trim();
    if (shortHome && existsSync(shortHome)) assert.throws(() => projectRoot(shortHome), /home directory/);
  }
  assert.throws(() => projectRoot(resolve(sep)), /filesystem root/);
});

test('dry run computes a complete local plan without creating anything', (t) => {
  const project = temporary(t);
  const plan = createPlan({ project, target: 'both' }, source(t));
  assert.equal(plan.files.length, 8);
  assert.ok(plan.files.every((file) => file.status === 'missing'));
  assert.deepEqual(installPlan(plan, { dryRun: true }), { ok: true, written: 0, updated: 0, planned: 8, plannedUpdates: 0, conflicts: 0 });
  assert.deepEqual(readdirSync(project), []);
  assert.ok(plan.files.some((file) => file.path === '.claude/commands/llmkit/start.md'));
  assert.ok(plan.files.every((file) => !file.path.includes('hooks') && !file.path.includes('settings')));
});

test('text dry run lists reviewable destinations and suppresses writes when a conflict blocks the plan', (t) => {
  const project = temporary(t);
  const args = ['--project', project, '--target', 'both', '--dry-run'];
  const preview = run('setup.mjs', args);
  assert.equal(preview.status, 0, preview.stderr);
  const paths = preview.stdout.split(/\r?\n/).filter((line) => line.startsWith(' - create: '));
  assert.ok(paths.includes(' - create: .agents/skills/start-here/SKILL.md'));
  assert.ok(paths.includes(' - create: .claude/skills/start-here/SKILL.md'));
  assert.match(preview.stdout, new RegExp(`Dry run: ${paths.length} file`));
  assert.deepEqual(readdirSync(project), []);

  write(project, '.agents/skills/start-here/SKILL.md', 'user version');
  const blocked = run('setup.mjs', args);
  assert.equal(blocked.status, 1, blocked.stderr);
  assert.match(blocked.stdout, /conflict: \.agents\/skills\/start-here\/SKILL\.md/);
  assert.doesNotMatch(blocked.stdout, / - create:/);
  assert.ok(!existsSync(join(project, '.claude')));
});

test('installation preserves supporting files, is idempotent and keeps the requested scope', (t) => {
  const project = temporary(t);
  const fixture = source(t);
  const first = createPlan({ project, target: 'codex' }, fixture);
  assert.equal(installPlan(first).written, 3);
  assert.equal(readFileSync(join(project, '.agents/skills/verify-before-done/references/check.md'), 'utf8'), 'reference');
  assert.ok(!existsSync(join(project, '.claude')));
  const second = createPlan({ project, target: 'codex' }, fixture);
  assert.ok(second.files.every((file) => file.status === 'identical'));
  assert.equal(installPlan(second).written, 0);
  assert.deepEqual(readdirSync(project).sort(), ['.agents', '.llmkit']);
});

test('doctor accepts Markdown checkout line endings and setup preserves the existing bytes', (t) => {
  const project = temporary(t);
  const args = ['--project', project, '--target', 'codex', '--json'];
  const setup = run('setup.mjs', args);
  assert.equal(setup.status, 0, setup.stderr);
  const path = '.agents/skills/start-here/SKILL.md';
  const original = readFileSync(join(project, path), 'utf8');
  const newline = original.includes('\r\n') ? '\n' : '\r\n';
  const converted = original.replace(/\r?\n/g, newline);
  assert.notEqual(converted, original);
  write(project, path, converted);

  const doctor = run('doctor.mjs', args);
  assert.equal(doctor.status, 0, doctor.stdout || doctor.stderr);
  const report = JSON.parse(doctor.stdout);
  assert.equal(report.counts.equivalent, 1);
  assert.equal(report.files.find((file) => file.path === path).status, 'equivalent');
  const repeat = run('setup.mjs', args);
  assert.equal(repeat.status, 0, repeat.stdout || repeat.stderr);
  assert.equal(JSON.parse(repeat.stdout).written, 0);
  assert.equal(readFileSync(join(project, path), 'utf8'), converted);
});

test('line-ending tolerance does not hide real Markdown edits or changes to supporting files', (t) => {
  const project = temporary(t);
  const fixture = source(t);
  write(fixture, 'skills/start-here/SKILL.md', '# Source\n');
  write(fixture, 'skills/start-here/resource.bin', Buffer.from([0x00, 0x0a, 0xff]));
  write(project, '.agents/skills/start-here/SKILL.md', '# Edited\r\n');
  write(project, '.agents/skills/start-here/resource.bin', Buffer.from([0x00, 0x0d, 0x0a, 0xff]));
  const plan = createPlan({ project, target: 'codex' }, fixture);
  assert.deepEqual(plan.files.filter((file) => file.status === 'conflict').map((file) => file.path).sort(), [
    '.agents/skills/start-here/SKILL.md', '.agents/skills/start-here/resource.bin',
  ]);
  assert.deepEqual(installPlan(plan), { ok: false, written: 0, updated: 0, conflicts: 2, blockedUpdates: 0 });
});

test('one modified destination blocks the entire installation before writes', (t) => {
  const project = temporary(t);
  const fixture = source(t);
  const path = '.agents/skills/verify-before-done/SKILL.md';
  write(project, path, 'user version');
  const plan = createPlan({ project, target: 'both' }, fixture);
  assert.deepEqual(installPlan(plan), { ok: false, written: 0, updated: 0, conflicts: 1, blockedUpdates: 0 });
  assert.equal(readFileSync(join(project, path), 'utf8'), 'user version');
  assert.ok(!existsSync(join(project, '.agents/skills/start-here')));
  assert.ok(!existsSync(join(project, '.claude')));
  assert.equal(installPlan(plan, { dryRun: true }).ok, false);
});

test('destination directory collisions and escaping paths are rejected', (t) => {
  const project = temporary(t);
  write(project, '.agents', 'user file');
  const plan = createPlan({ project, target: 'codex' }, source(t));
  assert.ok(plan.files.every((file) => file.status === 'conflict'));
  assert.equal(installPlan(plan).written, 0);
  assert.throws(() => checkDestination(project, join(project, '..', 'outside.md')), /escapes/);
});

test('symlink or Windows junction ancestors cannot redirect installation outside the project', (t) => {
  const project = temporary(t);
  const outside = temporary(t);
  try { symlinkSync(outside, join(project, '.agents'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Symlink creation unavailable in this environment'); return; }
    throw error;
  }
  const plan = createPlan({ project, target: 'codex' }, source(t));
  assert.ok(plan.files.every((file) => file.status === 'conflict' && /Symbolic link/.test(file.reason)));
  assert.equal(installPlan(plan).written, 0);
  assert.deepEqual(readdirSync(outside), []);
});

test('files that appear after preflight are not overwritten and earlier creations are rolled back', (t) => {
  const project = temporary(t);
  const plan = createPlan({ project, target: 'codex' }, source(t));
  const last = plan.files.at(-1);
  write(project, last.path, 'concurrent file');
  assert.throws(() => installPlan(plan), /rolled back/);
  assert.equal(readFileSync(last.destination, 'utf8'), 'concurrent file');
  assert.ok(!existsSync(plan.files[0].destination));
});

test('setup and doctor CLIs use machine-readable output and detect missing or changed installed files', (t) => {
  const project = temporary(t);
  const args = ['--project', project, '--target', 'both', '--json'];
  const before = run('doctor.mjs', args);
  assert.equal(before.status, 1, before.stderr);
  assert.ok(JSON.parse(before.stdout).counts.missing > 0);
  const dry = run('setup.mjs', [...args, '--dry-run']);
  assert.equal(dry.status, 0, dry.stderr);
  assert.deepEqual(readdirSync(project), []);
  const setup = run('setup.mjs', args);
  assert.equal(setup.status, 0, setup.stderr);
  const result = JSON.parse(setup.stdout);
  assert.equal(result.hooks.status, 'not-managed');
  assert.equal(result.counts.conflict, 0);
  assert.equal(result.counts.missing, 0, 'final report must describe the files after installation');
  assert.ok(result.files.every((file) => file.status === 'identical'));
  assert.ok(result.written > 0);
  const after = run('doctor.mjs', args);
  assert.equal(after.status, 0, after.stderr);
  assert.equal(JSON.parse(after.stdout).ok, true);
  const changed = result.files.find((file) => file.path.endsWith('/start-here/SKILL.md'));
  write(project, changed.path, 'modified by user');
  const drift = run('doctor.mjs', args);
  assert.equal(drift.status, 1, drift.stderr);
  const report = JSON.parse(drift.stdout);
  assert.equal(report.counts.conflict, 1);
  assert.ok(report.files.find((file) => file.path === changed.path && file.status === 'conflict'));
  const install = run('setup.mjs', args);
  assert.equal(install.status, 1, install.stderr);
  assert.equal(JSON.parse(install.stdout).written, 0);
  assert.equal(readFileSync(join(project, changed.path), 'utf8'), 'modified by user');
  assert.ok(result.files.every((file) => !relative(project, join(project, file.path)).startsWith('..')));
});

test('CLI usage errors are distinct from failed integrity checks', () => {
  const output = run('setup.mjs', ['--json']);
  assert.equal(output.status, 2);
  assert.equal(JSON.parse(output.stdout).ok, false);
  assert.match(JSON.parse(output.stdout).error, /--project/);
});

test('core installs only portable skills; full expands the project without removing anything', (t) => {
  const project = temporary(t);
  const args = ['--project', project, '--target', 'both', '--json'];
  const core = [...args, '--profile', 'core'];
  const preview = run('setup.mjs', [...core, '--dry-run']);
  assert.equal(preview.status, 0, preview.stderr);
  const plan = JSON.parse(preview.stdout);
  assert.equal(plan.profile, 'core');
  assert.equal(plan.planned, 16);
  assert.deepEqual(readdirSync(project), []);

  const setup = run('setup.mjs', core);
  assert.equal(setup.status, 0, setup.stderr);
  const installed = JSON.parse(setup.stdout);
  assert.equal(installed.written, plan.planned);
  assert.ok(installed.files.every(({ path }) => /^(?:\.agents|\.claude)\/skills\//.test(path)));
  assert.ok(installed.files.some(({ path }) => path === '.claude/skills/start-here/SKILL.md'));
  assert.ok(!existsSync(join(project, '.claude/commands')));
  assert.equal(run('doctor.mjs', core).status, 0);
  assert.equal(run('doctor.mjs', args).status, 1);

  const expanded = run('setup.mjs', args);
  assert.equal(expanded.status, 0, expanded.stdout || expanded.stderr);
  const full = JSON.parse(expanded.stdout);
  assert.equal(full.profile, 'full');
  assert.ok(full.written > 0);
  const outsideCore = '.claude/commands/llmkit/ship.md';
  write(project, outsideCore, 'user customized a full-only command');
  assert.equal(run('setup.mjs', core).status, 0);
  assert.equal(readFileSync(join(project, outsideCore), 'utf8'), 'user customized a full-only command');
  assert.equal(run('doctor.mjs', core).status, 0);
  assert.equal(run('doctor.mjs', args).status, 1);
});

test('updates are explicit, previewable and limited to recorded exact bytes', (t) => {
  const project = temporary(t);
  const fixture = source(t);
  const args = { project, target: 'codex' };
  const path = '.agents/skills/start-here/SKILL.md';
  const stateFile = join(project, '.llmkit/install.json');
  for (const script of ['setup.mjs', 'doctor.mjs', 'installation.mjs', 'lifecycle.mjs']) {
    write(fixture, `scripts/${script}`, readFileSync(join(scripts, script)));
  }
  const fixtureScripts = join(fixture, 'scripts');
  const cli = ['--project', project, '--target', 'codex', '--json'];
  assert.equal(installPlan(createPlan(args, fixture)).written, 3);
  const previous = readFileSync(stateFile, 'utf8');
  assert.ok(JSON.parse(previous).files[path]);
  write(fixture, 'skills/start-here/SKILL.md', 'start here version two');
  write(fixture, 'skills/start-here/references/new.md', 'new reference');
  const upgrade = createPlan(args, fixture);
  assert.equal(upgrade.files.find((file) => file.path === path).status, 'outdated');
  const diagnosis = run('doctor.mjs', cli, fixtureScripts);
  assert.equal(diagnosis.status, 1, diagnosis.stderr);
  assert.equal(JSON.parse(diagnosis.stdout).counts.outdated, 1);
  const blocked = installPlan(upgrade);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.blockedUpdates, 1);
  const dry = run('setup.mjs', [...cli, '--update', '--dry-run'], fixtureScripts);
  assert.equal(dry.status, 0, dry.stdout || dry.stderr);
  const preview = JSON.parse(dry.stdout);
  assert.equal(preview.planned, 1);
  assert.equal(preview.plannedUpdates, 1);
  assert.equal(readFileSync(stateFile, 'utf8'), previous);
  assert.equal(readFileSync(join(project, path), 'utf8'), 'start here');
  assert.ok(!existsSync(join(project, '.agents/skills/start-here/references/new.md')));

  const applied = run('setup.mjs', [...cli, '--update'], fixtureScripts);
  assert.equal(applied.status, 0, applied.stdout || applied.stderr);
  const result = JSON.parse(applied.stdout);
  assert.equal(result.updated, 1);
  assert.equal(result.written, 1);
  assert.equal(result.counts.outdated, 0);
  assert.equal(readFileSync(join(project, path), 'utf8'), 'start here version two');
  const next = readFileSync(stateFile, 'utf8');
  assert.notEqual(JSON.parse(previous).files[path], JSON.parse(next).files[path]);
  assert.deepEqual(installPlan(createPlan(args, fixture), { update: true }), { ok: true, written: 0, updated: 0, conflicts: 0 });
  assert.equal(readFileSync(stateFile, 'utf8'), next);

  write(project, path, 'user edited this managed file');
  write(fixture, 'skills/start-here/SKILL.md', 'start here version three');
  write(fixture, 'skills/start-here/references/another.md', 'another reference');
  const conflict = installPlan(createPlan(args, fixture), { update: true });
  assert.equal(conflict.conflicts, 1);
  assert.equal(conflict.updated, 0);
  assert.equal(readFileSync(join(project, path), 'utf8'), 'user edited this managed file');
  assert.equal(readFileSync(stateFile, 'utf8'), next);
  assert.ok(!existsSync(join(project, '.agents/skills/start-here/references/another.md')));
});

test('matching pre-existing files are left alone and cannot be adopted by setup or update', (t) => {
  const project = temporary(t);
  const fixture = source(t);
  const args = { project, target: 'codex' };
  const path = '.agents/skills/start-here/SKILL.md';
  write(project, path, 'start here');
  assert.equal(installPlan(createPlan(args, fixture), { update: true }).written, 2);
  const ledger = JSON.parse(readFileSync(join(project, '.llmkit/install.json'), 'utf8'));
  assert.equal(Object.hasOwn(ledger.files, path), false);
  write(fixture, 'skills/start-here/SKILL.md', 'new router');
  const next = createPlan(args, fixture);
  assert.match(next.files.find((file) => file.path === path).reason, /not created/);
  assert.equal(installPlan(next, { update: true }).ok, false);
  assert.equal(readFileSync(join(project, path), 'utf8'), 'start here');
});

test('an update restores earlier writes if a later target changes after preflight', (t) => {
  const project = temporary(t);
  const fixture = source(t);
  const args = { project, target: 'codex' };
  const first = '.agents/skills/start-here/SKILL.md';
  const last = '.agents/skills/verify-before-done/SKILL.md';
  const stateFile = join(project, '.llmkit/install.json');
  installPlan(createPlan(args, fixture));
  const previous = readFileSync(stateFile, 'utf8');
  write(fixture, 'skills/start-here/SKILL.md', 'new start');
  write(fixture, 'skills/verify-before-done/SKILL.md', 'new verify');
  const upgrade = createPlan(args, fixture);
  assert.deepEqual(upgrade.files.filter((file) => file.status === 'outdated').map((file) => file.path), [first, last]);
  write(project, last, 'concurrent user edit');
  assert.throws(() => installPlan(upgrade, { update: true }), /changed after preflight.*rolled back/);
  assert.equal(readFileSync(join(project, first), 'utf8'), 'start here');
  assert.equal(readFileSync(join(project, last), 'utf8'), 'concurrent user edit');
  assert.equal(readFileSync(stateFile, 'utf8'), previous);
  assert.deepEqual(readdirSync(join(project, '.llmkit')), ['install.json']);
});

test('lock contention, concurrent ledger changes and malformed ownership metadata fail closed', (t) => {
  const project = temporary(t);
  const fixture = source(t);
  const args = { project, target: 'codex' };
  const path = '.agents/skills/start-here/SKILL.md';
  const ledger = '.llmkit/install.json';
  installPlan(createPlan(args, fixture));
  write(fixture, 'skills/start-here/SKILL.md', 'new start');
  const upgrade = createPlan(args, fixture);
  write(project, '.llmkit/install.lock', 'other process');
  assert.throws(() => installPlan(upgrade, { update: true }), /Setup lock exists/);
  assert.equal(readFileSync(join(project, '.llmkit/install.lock'), 'utf8'), 'other process');
  const concurrent = temporary(t);
  const concurrentArgs = { project: concurrent, target: 'codex' };
  installPlan(createPlan(concurrentArgs, fixture));
  write(fixture, 'skills/start-here/SKILL.md', 'next version');
  const concurrentPlan = createPlan(concurrentArgs, fixture);
  write(concurrent, ledger, readFileSync(join(concurrent, ledger), 'utf8') + '\n');
  assert.throws(() => installPlan(concurrentPlan, { update: true }), /ledger changed after preflight/);
  assert.equal(readFileSync(join(concurrent, path), 'utf8'), 'new start');
  assert.equal(readFileSync(join(project, path), 'utf8'), 'start here');
  write(concurrent, ledger, '{"format":"llmkit-install","version":1,"files":{"../outside":"bad"}}');
  assert.throws(() => createPlan(concurrentArgs, fixture), /Cannot use.*invalid file record/);
});

test('uninstall previews, scopes by target, protects edits and removes empty directories cleanly', (t) => {
  const project = temporary(t);
  const fixture = source(t);
  write(project, '.agents/skills/custom/SKILL.md', 'user skill');
  assert.equal(installPlan(createPlan({ project, target: 'both' }, fixture)).written, 8);

  const preview = run('setup.mjs', ['--project', project, '--target', 'codex', '--uninstall', '--dry-run']);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, / - remove: \.agents\/skills\/start-here\/SKILL\.md/);
  assert.ok(existsSync(join(project, '.agents/skills/start-here/SKILL.md')));

  const partial = run('setup.mjs', ['--project', project, '--target', 'codex', '--uninstall', '--json']);
  assert.equal(partial.status, 0, partial.stderr);
  const partialReport = JSON.parse(partial.stdout);
  assert.equal(partialReport.operation, 'uninstall');
  assert.equal(partialReport.removed, 3);
  assert.equal(partialReport.ledger.status, 'present');
  assert.ok(!existsSync(join(project, '.agents/skills/start-here/SKILL.md')));
  assert.equal(readFileSync(join(project, '.agents/skills/custom/SKILL.md'), 'utf8'), 'user skill');
  assert.ok(existsSync(join(project, '.claude/skills/start-here/SKILL.md')));

  const claudeTarget = '.claude/skills/start-here/SKILL.md';
  write(project, claudeTarget, 'edited by user');
  const blocked = run('setup.mjs', ['--project', project, '--target', 'claude', '--uninstall', '--json']);
  assert.equal(blocked.status, 1, blocked.stderr);
  assert.equal(JSON.parse(blocked.stdout).conflicts, 1);
  assert.equal(readFileSync(join(project, claudeTarget), 'utf8'), 'edited by user');
  assert.ok(existsSync(join(project, '.claude/commands/llmkit/start.md')));

  write(project, claudeTarget, 'start here');
  rmSync(join(project, '.claude/commands/llmkit/start.md'));
  const clean = run('setup.mjs', ['--project', project, '--target', 'claude', '--uninstall', '--json']);
  assert.equal(clean.status, 0, clean.stderr);
  const cleanReport = JSON.parse(clean.stdout);
  assert.equal(cleanReport.removed, 4);
  assert.equal(cleanReport.pruned, 1);
  assert.equal(cleanReport.ledger.status, 'missing');
  assert.ok(!existsSync(join(project, '.claude')));
  assert.ok(!existsSync(join(project, '.llmkit')));
  assert.equal(readFileSync(join(project, '.agents/skills/custom/SKILL.md'), 'utf8'), 'user skill');

  assert.deepEqual(uninstallPlan(createUninstallPlan({ project, target: 'both' })), { ok: true, removed: 0, pruned: 0, conflicts: 0 });
});

test('uninstall rolls back earlier removals if a later target changes after preflight', (t) => {
  const project = temporary(t);
  const fixture = source(t);
  installPlan(createPlan({ project, target: 'codex' }, fixture));
  const plan = createUninstallPlan({ project, target: 'codex' });
  const last = plan.files.at(-1);
  write(project, last.path, 'concurrently edited');
  assert.throws(() => uninstallPlan(plan), /changed after preflight.*rolled back/);
  assert.equal(readFileSync(plan.files[0].destination, 'utf8'), 'start here');
  assert.equal(readFileSync(last.destination, 'utf8'), 'concurrently edited');
  assert.ok(existsSync(join(project, '.llmkit/install.json')));
});

test('agents target installs, verifies and uninstalls portable skills only', (t) => {
  const project = temporary(t);
  const fixture = source(t);
  for (const script of ['setup.mjs', 'doctor.mjs', 'installation.mjs', 'lifecycle.mjs']) {
    write(fixture, `scripts/${script}`, readFileSync(join(scripts, script)));
  }
  const fixtureScripts = join(fixture, 'scripts');
  const cli = ['--project', project, '--target', 'agents', '--json'];

  const setup = run('setup.mjs', cli, fixtureScripts);
  assert.equal(setup.status, 0, setup.stdout || setup.stderr);
  const installed = JSON.parse(setup.stdout);
  assert.equal(installed.written, 3);
  assert.ok(installed.files.every(({ path }) => path.startsWith('.agents/skills/')));
  assert.ok(!existsSync(join(project, '.claude')));

  const check = run('doctor.mjs', cli, fixtureScripts);
  assert.equal(check.status, 0, check.stdout || check.stderr);
  assert.equal(run('doctor.mjs', ['--project', project, '--target', 'claude', '--json'], fixtureScripts).status, 1);

  const removed = run('setup.mjs', [...cli, '--uninstall'], fixtureScripts);
  assert.equal(removed.status, 0, removed.stdout || removed.stderr);
  assert.equal(JSON.parse(removed.stdout).removed, 3);
  assert.ok(!existsSync(join(project, '.agents')));
  assert.ok(!existsSync(join(project, '.llmkit')));
});

test('CRLF conversion on managed markdown files still allows update and uninstall while real edits conflict', (t) => {
  const project = temporary(t);
  const fixture = source(t);
  const path = '.agents/skills/start-here/SKILL.md';
  write(fixture, 'skills/start-here/SKILL.md', 'line one\nline two');
  assert.equal(installPlan(createPlan({ project, target: 'agents' }, fixture)).written, 3);

  write(project, path, 'line one\r\nline two');
  write(fixture, 'skills/start-here/SKILL.md', 'line one\nline two\nline three');
  const updated = installPlan(createPlan({ project, target: 'agents' }, fixture), { update: true });
  assert.equal(updated.ok, true);
  assert.equal(updated.updated, 1);
  assert.equal(readFileSync(join(project, path), 'utf8'), 'line one\nline two\nline three');

  write(project, path, 'line one\r\nline two\r\nline three!');
  write(fixture, 'skills/start-here/SKILL.md', 'line one\nline two\nline four');
  const conflictUpdate = installPlan(createPlan({ project, target: 'agents' }, fixture), { update: true });
  assert.equal(conflictUpdate.ok, false);
  assert.equal(conflictUpdate.conflicts, 1);
  const conflictUninstall = uninstallPlan(createUninstallPlan({ project, target: 'agents' }));
  assert.equal(conflictUninstall.ok, false);
  assert.equal(conflictUninstall.conflicts, 1);

  write(project, path, 'line one\r\nline two\r\nline three');
  const cleanUninstall = uninstallPlan(createUninstallPlan({ project, target: 'agents' }));
  assert.equal(cleanUninstall.ok, true);
  assert.equal(cleanUninstall.removed, 3);
  assert.ok(!existsSync(join(project, '.agents')));
});
