// Shared, local-only installation planner. No shell calls, network requests or global config edits.
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  applyChanges,
  applyRemovals,
  isManagedPath,
  ledgerPath,
  matchesRecorded,
  readDestination,
  readLedger,
} from './lifecycle.mjs';

export { checkDestination } from './lifecycle.mjs';

export const toolkitRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const usage =
  'Usage: node scripts/<setup|doctor>.mjs --project <existing-directory> --target <agents|codex|claude|both> [--profile core|full] [--update] [--uninstall] [--dry-run] [--json]\n' +
  'Profile defaults to full. --update, --uninstall and --dry-run are setup-only.';

const coreSkills = new Set([
  'start-here',
  'spec-first',
  'test-first',
  'debug-root-cause',
  'checkpoint-rollback',
  'untrusted-input',
  'review-diff',
  'verify-before-done',
]);

const validTargets = ['agents', 'codex', 'claude', 'both'];
const targetPrefixes = { agents: ['.agents/skills/'], codex: ['.agents/skills/'], claude: ['.claude/'] };

export function parseOptions(args, { doctor = false } = {}) {
  const options = { dryRun: false, json: false, help: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--dry-run' && !doctor) {
      options.dryRun = true;
    } else if (arg === '--update' && !doctor) {
      options.update = true;
    } else if (arg === '--uninstall' && !doctor) {
      options.uninstall = true;
    } else if (arg === '--project' || arg === '--target' || arg === '--profile') {
      const key = arg.slice(2);
      if (options[key]) {
        throw new Error(`Duplicate ${arg}`);
      }
      if (!args[i + 1] || args[i + 1].startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      options[key] = args[++i];
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (options.help) {
    return options;
  }
  if (!options.project) {
    throw new Error('--project is required; no default or global installation');
  }
  if (!validTargets.includes(options.target)) {
    throw new Error('--target must be agents, codex, claude or both');
  }
  if (options.update && options.uninstall) {
    throw new Error('--update and --uninstall cannot be combined');
  }
  if (options.uninstall && options.profile) {
    throw new Error('--profile cannot be combined with --uninstall');
  }
  if (options.profile && !['core', 'full'].includes(options.profile)) {
    throw new Error('--profile must be core or full');
  }
  options.profile ??= 'full';
  return options;
}

export function projectRoot(path) {
  const root = realpathSync.native(resolve(path));
  if (!lstatSync(root).isDirectory()) {
    throw new Error('--project must be an existing directory');
  }
  if (root === dirname(root) || root === realpathSync.native(homedir())) {
    throw new Error('--project must be a project directory, not the filesystem root or your home directory');
  }
  return root;
}

function sourceFiles(directory, prefix = '') {
  const directoryStat = lstatSync(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error(`Source must be a regular directory: ${directory}`);
  }
  const result = [];
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  for (const entry of entries) {
    const source = join(directory, entry.name);
    const path = join(prefix, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Symbolic link source refused: ${source}`);
    }
    if (entry.isDirectory()) {
      result.push(...sourceFiles(source, path));
    } else if (entry.isFile()) {
      result.push({ source, path });
    } else {
      throw new Error(`Source is not a regular file: ${source}`);
    }
  }
  return result;
}

function compareFiles(path, source, destination) {
  if (source.equals(destination)) {
    return 'identical';
  }
  if (/\.md$/i.test(path)) {
    // Git checkouts may convert LF and CRLF; latin1 keeps every other byte intact.
    const normalize = (bytes) => bytes.toString('latin1').replace(/\r\n/g, '\n');
    if (normalize(source) === normalize(destination)) {
      return 'equivalent';
    }
  }
  return 'conflict';
}

export function createPlan({ project, target, profile = 'full' }, sourceRoot = toolkitRoot) {
  if (!validTargets.includes(target)) {
    throw new Error('Unknown installation target');
  }
  if (!['core', 'full'].includes(profile)) {
    throw new Error('Unknown installation profile');
  }

  const root = projectRoot(project);
  const targets = target === 'both' ? ['codex', 'claude'] : [target];
  const ledger = readLedger(root);
  const sources = sourceFiles(join(sourceRoot, 'skills')).filter(
    (file) => profile === 'full' || coreSkills.has(file.path.split(sep)[0]),
  );

  if (profile === 'core') {
    for (const name of coreSkills) {
      if (!sources.some((file) => file.path === join(name, 'SKILL.md'))) {
        throw new Error(`Core profile is missing ${name}/SKILL.md`);
      }
    }
  }
  if (sources.length === 0) {
    throw new Error('Toolkit has no skills to install');
  }

  const files = [];
  for (const client of targets) {
    const base = client === 'claude' ? '.claude' : '.agents';
    for (const file of sources) {
      files.push({ ...file, path: join(base, 'skills', file.path), client });
    }
    if (client === 'claude' && profile === 'full') {
      for (const file of sourceFiles(join(sourceRoot, 'agents'))) {
        files.push({ ...file, path: join(base, 'agents', file.path), client });
      }
      for (const file of sourceFiles(join(sourceRoot, 'commands'))) {
        files.push({ ...file, path: join(base, 'commands', 'llmkit', file.path), client });
      }
    }
  }

  for (const file of files) {
    file.destination = join(root, file.path);
    file.path = file.path.split(sep).join('/');
    try {
      if (!isManagedPath(file.path)) {
        throw new Error('Invalid managed file path');
      }
      const sourceStat = lstatSync(file.source);
      if (!sourceStat.isFile()) {
        throw new Error('Source is no longer a regular file');
      }
      file.sourceMode = sourceStat.mode & 0o777;
      file.sourceBytes = readFileSync(file.source);
      const destination = readDestination(root, file.destination);
      file.status = destination ? compareFiles(file.path, file.sourceBytes, destination.bytes) : 'missing';
      if (file.status === 'conflict') {
        const owned = ledger.files[file.path];
        if (owned && matchesRecorded(file.path, destination.bytes, owned)) {
          file.status = 'outdated';
        } else {
          file.reason = owned ? 'File differs from the recorded installed bytes' : 'File was not created by this installer';
        }
      }
    } catch (error) {
      file.status = 'conflict';
      file.reason = error.message;
    }
  }

  return { root, targets, profile, files, ledger };
}

export function installPlan(plan, { dryRun = false, update = false } = {}) {
  const conflicts = plan.files.filter((file) => file.status === 'conflict').length;
  const outdated = plan.files.filter((file) => file.status === 'outdated');
  if (conflicts || (outdated.length && !update)) {
    return { ok: false, written: 0, updated: 0, conflicts, blockedUpdates: update ? 0 : outdated.length };
  }

  const missing = plan.files.filter((file) => file.status === 'missing');
  if (dryRun) {
    return { ok: true, written: 0, updated: 0, planned: missing.length, plannedUpdates: outdated.length, conflicts: 0 };
  }

  const changes = plan.files.filter((file) => file.status === 'missing' || file.status === 'outdated');
  if (changes.length) {
    applyChanges(plan, changes);
  }
  return { ok: true, written: missing.length, updated: outdated.length, conflicts: 0 };
}

export function createUninstallPlan({ project, target }) {
  if (!validTargets.includes(target)) {
    throw new Error('Unknown installation target');
  }
  const root = projectRoot(project);
  const targets = target === 'both' ? ['codex', 'claude'] : [target];
  const prefixes = targets.flatMap((client) => targetPrefixes[client]);
  const ledger = readLedger(root);
  const files = [];

  for (const path of Object.keys(ledger.files).sort((a, b) => a.localeCompare(b, 'en'))) {
    if (!prefixes.some((prefix) => path.startsWith(prefix))) {
      continue;
    }
    const client = path.startsWith('.agents/') ? (targets.includes('agents') ? 'agents' : 'codex') : 'claude';
    const destination = join(root, ...path.split('/'));
    const entry = { path, client, destination, recordedHash: ledger.files[path] };
    try {
      const existing = readDestination(root, destination);
      if (!existing) {
        entry.status = 'absent';
      } else if (matchesRecorded(path, existing.bytes, entry.recordedHash)) {
        entry.status = 'remove';
      } else {
        entry.status = 'conflict';
        entry.reason = 'File differs from the recorded installed bytes';
      }
    } catch (error) {
      entry.status = 'conflict';
      entry.reason = error.message;
    }
    files.push(entry);
  }

  return { root, targets, profile: 'uninstall', files, ledger };
}

export function uninstallPlan(plan, { dryRun = false } = {}) {
  const conflicts = plan.files.filter((file) => file.status === 'conflict').length;
  if (conflicts) {
    return { ok: false, removed: 0, pruned: 0, conflicts };
  }

  const removals = plan.files.filter((file) => file.status === 'remove');
  const absent = plan.files.filter((file) => file.status === 'absent');
  if (dryRun) {
    return { ok: true, removed: 0, pruned: 0, plannedRemovals: removals.length, plannedPrunes: absent.length, conflicts: 0 };
  }

  if (removals.length || absent.length) {
    applyRemovals(plan, removals, absent);
  }
  return { ok: true, removed: removals.length, pruned: absent.length, conflicts: 0 };
}

export function report(plan, operation, result = {}) {
  const statuses =
    operation === 'uninstall'
      ? ['remove', 'absent', 'conflict']
      : ['missing', 'identical', 'equivalent', 'outdated', 'conflict'];
  const counts = Object.fromEntries(statuses.map((status) => [status, plan.files.filter((file) => file.status === status).length]));
  return {
    operation,
    project: plan.root,
    targets: plan.targets,
    profile: plan.profile,
    counts,
    ...result,
    ledger: { path: ledgerPath, status: plan.ledger.snapshot ? 'present' : 'missing' },
    hooks: { status: 'not-managed', detail: 'Setup does not install hooks or change client settings. Runtime activation is not checked.' },
    files: plan.files.map(({ path, client, status, reason }) => ({ path, client, status, ...(reason ? { reason } : {}) })),
  };
}

export function printReport(data, json) {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  if (data.operation === 'uninstall') {
    console.log(`uninstall: ${data.ok ? 'ok' : 'needs attention'} (${data.targets.join(', ')})`);
    console.log(`Project: ${data.project}`);
    console.log(`${data.counts.remove} removable; ${data.counts.absent} missing record(s); ${data.counts.conflict} conflicting file(s).`);
    if (data.dryRun) {
      console.log(`Dry run: ${data.plannedRemovals ?? 0} file(s) would be removed; ${data.plannedPrunes ?? 0} stale record(s) pruned. Nothing was deleted.`);
      if (data.ok) {
        for (const file of data.files) {
          if (file.status === 'remove') {
            console.log(` - remove: ${file.path}`);
          } else if (file.status === 'absent') {
            console.log(` - prune record: ${file.path}`);
          }
        }
      }
    } else {
      console.log(`Removed ${data.removed} file(s); pruned ${data.pruned} stale record(s).`);
    }
    for (const file of data.files.filter((item) => item.status === 'conflict')) {
      console.log(` - ${file.status}: ${file.path}${file.reason ? ` (${file.reason})` : ''}`);
    }
    console.log(data.hooks.detail);
    return;
  }

  console.log(`${data.operation}: ${data.ok ? 'ok' : 'needs attention'} (${data.targets.join(', ')}; ${data.profile} profile)`);
  console.log(`Project: ${data.project}`);
  console.log(`${data.counts.identical} identical; ${data.counts.missing} missing; ${data.counts.outdated} outdated; ${data.counts.conflict} conflicting file(s).`);
  if (data.counts.equivalent) {
    console.log(`${data.counts.equivalent} Markdown file(s) match apart from LF/CRLF line endings.`);
  }
  if (data.dryRun) {
    console.log(`Dry run: ${data.planned ?? 0} file(s) would be created; ${data.plannedUpdates ?? 0} updated. Nothing was written.`);
    if (data.ok) {
      for (const file of data.files) {
        if (file.status === 'missing') {
          console.log(` - create: ${file.path}`);
        } else if (file.status === 'outdated') {
          console.log(` - update: ${file.path}`);
        }
      }
    }
  } else if (data.operation === 'setup') {
    console.log(`Created ${data.written} file(s); updated ${data.updated} managed file(s).`);
  }

  const flagged = data.files.filter(
    (file) =>
      file.status === 'conflict' ||
      (file.status === 'outdated' && !(data.dryRun && data.ok)) ||
      (data.operation === 'doctor' && file.status === 'missing'),
  );
  for (const file of flagged) {
    console.log(` - ${file.status}: ${file.path}${file.reason ? ` (${file.reason})` : ''}`);
  }
  if (data.counts.outdated && !(data.dryRun && data.ok)) {
    console.log('To review updates to previously installed files, run setup with --update --dry-run.');
  }
  if (data.dryRun && data.ok && (data.planned || data.plannedUpdates)) {
    console.log(` - record ownership: ${data.ledger.path}`);
  }
  if (data.profile === 'core') {
    console.log('Core includes selected skills only. Existing components outside this profile were left alone.');
  }
  console.log(data.hooks.detail);
  if (data.scope) {
    console.log(data.scope);
  }
  if (data.operation === 'setup' && data.ok && !data.dryRun) {
    console.log('Restart your client in the selected project to discover the installed skills.');
  }
}

export function requireNode() {
  if (Number(process.versions.node.split('.')[0]) < 20) {
    throw new Error('Node.js 20 or newer is required');
  }
}
