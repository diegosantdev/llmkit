#!/usr/bin/env node
// Explicit file snapshots. Never invokes Git or writes inside the source project.
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, parse, posix, relative, resolve, sep, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scan } from './hooks/secret-scan.mjs';

const MAX_BYTES = 128 * 1024 * 1024;
const MAX_MANIFEST = 4 * 1024 * 1024;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hashShape = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

function expect(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function within(root, target) {
  const path = relative(root, target);
  return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`);
}

const usage = [
  'Usage: node scripts/checkpoint.mjs create --project <existing-dir> --snapshot <new-dir> --file <relative-file> [--file ...] [--dry-run] [--json]',
  '       node scripts/checkpoint.mjs verify --snapshot <existing-dir> [--json]',
  '       node scripts/checkpoint.mjs recover --snapshot <existing-dir> --output <new-dir> [--json]',
].join('\n');

class IntegrityError extends Error {}

function options(args) {
  const [operation, ...rest] = args;
  if (args.length === 0 || (args.length === 1 && ['--help', '-h'].includes(operation))) {
    return { help: true };
  }
  expect(['create', 'verify', 'recover'].includes(operation), 'Expected create, verify or recover');

  const result = { operation, files: [], json: false, dryRun: false };
  const allowed = [
    '--snapshot',
    ...(operation === 'create' ? ['--project', '--file'] : operation === 'recover' ? ['--output'] : []),
  ];

  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === '--json') {
      result.json = true;
    } else if (flag === '--dry-run' && operation === 'create') {
      result.dryRun = true;
    } else {
      expect(allowed.includes(flag), `Unknown option for ${operation}: ${flag}`);
      const value = rest[++i];
      expect(value && !value.startsWith('--'), `${flag} requires a value`);
      if (flag === '--file') {
        result.files.push(value);
      } else {
        const key = flag.slice(2);
        expect(!result[key], `Duplicate ${flag}`);
        result[key] = value;
      }
    }
  }

  expect(result.snapshot, '--snapshot is required');
  if (operation === 'create') {
    expect(result.project && result.files.length, '--project and at least one explicit --file are required');
  }
  if (operation === 'recover') {
    expect(result.output, '--output is required');
  }
  return result;
}

function maybeStat(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

// Walk every path segment rather than only the leaf so Windows junctions are caught too.
function directory(value) {
  const path = resolve(value);
  const root = parse(path).root;
  let current = root;
  for (const part of relative(root, path).split(sep).filter(Boolean)) {
    current = join(current, part);
    const stat = lstatSync(current);
    expect(!stat.isSymbolicLink() && stat.isDirectory(), `Expected a directory without links: ${current}`);
  }
  return realpathSync.native(path);
}

function safePart(part) {
  return (
    part &&
    part !== '.' &&
    part !== '..' &&
    !/[<>:"|?*\x00-\x1f\x7f]/.test(part) &&
    !/[. ]$/.test(part) &&
    !/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part)
  );
}

const sensitivePart = (part) =>
  /^(?:\.git|\.ssh|\.gnupg|\.aws|\.azure|\.kube|\.env(?:\..*)?|\.envrc|\.git-credentials|\.npmrc|\.netrc|_netrc|\.pypirc|credentials\.json|id_(?:rsa|ed25519|ecdsa|dsa))$/i.test(part) ||
  /\.(?:pem|key|p12|pfx|jks|keystore|kdbx)$/i.test(part);

const gitMetadata = (path) => path.split(/[\\/]/).some((part) => part.toLowerCase() === '.git');

function newDirectory(value) {
  const path = resolve(value);
  const leaf = basename(path);
  expect(safePart(leaf), 'Use a portable name for the new directory');
  const target = join(directory(dirname(path)), leaf);
  expect(!gitMetadata(target), 'Checkpoint directories cannot be inside Git metadata');
  expect(!maybeStat(target), `Directory must be new; nothing will be overwritten: ${target}`);
  return target;
}

function filePath(value) {
  expect(typeof value === 'string' && value.length > 0 && value.length <= 4096, 'Invalid file path');
  const path = value.replaceAll('\\', '/').replace(/^(?:\.\/)+/, '');
  const parts = path.split('/');
  expect(parts.every(safePart), 'Use explicit project-relative file paths without traversal or wildcards');
  expect(!parts.some(sensitivePart) && !scan(path).length, 'Git metadata or an obvious credential path is excluded');
  return path;
}

function checkCollisions(paths) {
  const seen = new Map();
  for (const path of paths) {
    const parts = path.split('/');
    let prefix = '';
    for (const [index, part] of parts.entries()) {
      prefix += (prefix ? '/' : '') + part;
      const key = prefix.normalize('NFC').toLowerCase();
      const last = index === parts.length - 1;
      const previous = seen.get(key);
      expect(!previous || (!previous.last && !last && previous.prefix === prefix), 'Duplicate or colliding checkpoint paths');
      seen.set(key, { prefix, last });
    }
  }
}

function readRegular(path, limit, exactSize) {
  const parent = directory(dirname(path));
  const target = join(parent, basename(path));
  const info = lstatSync(target);
  expect(!info.isSymbolicLink() && info.isFile() && info.nlink <= 1, `Expected a regular file without links: ${target}`);
  const fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fstatSync(fd);
    expect(
      stat.isFile() && stat.dev === info.dev && stat.ino === info.ino && stat.nlink <= 1,
      `File changed while opening: ${target}`,
    );
    expect(exactSize === undefined || stat.size === exactSize, `File size does not match the manifest: ${target}`);
    expect(stat.size <= limit, 'Checkpoint size limit exceeded (128 MiB of selected file data; 4 MiB manifest)');

    const data = Buffer.alloc(stat.size);
    for (let offset = 0; offset < data.length; ) {
      const count = readSync(fd, data, offset, data.length - offset, null);
      expect(count > 0, `File changed while reading: ${target}`);
      offset += count;
    }

    const end = fstatSync(fd);
    expect(
      end.size === stat.size && end.mtimeMs === stat.mtimeMs && end.ctimeMs === stat.ctimeMs,
      `File changed while reading: ${target}`,
    );
    return data;
  } finally {
    closeSync(fd);
  }
}

const sorted = (paths) => [...paths].sort();
const manifestBody = (project, files) => ({ version: 1, project, files });
const manifestDigest = (body) => sha256(JSON.stringify(body));

const exactFields = (value, keys) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((key) => Object.hasOwn(value, key));

const hasCredential = (data) =>
  scan(data.toString(data[0] === 0xff && data[1] === 0xfe ? 'utf16le' : 'utf8')).length > 0;

function metadata(project, paths) {
  let remaining = MAX_BYTES;
  return paths.map((path) => {
    const data = readRegular(join(project, ...path.split('/')), remaining);
    expect(!hasCredential(data), `Credential-like content was refused in ${path}`);
    remaining -= data.length;
    return { path, bytes: data.length, sha256: sha256(data), data };
  });
}

function validateManifest(manifest) {
  expect(
    exactFields(manifest, ['version', 'project', 'files', 'digest']) && manifest.version === 1 && hashShape(manifest.digest),
    'Invalid checkpoint manifest',
  );
  const { project } = manifest;
  expect(
    typeof project === 'string' && !/[\x00-\x1f\x7f]/.test(project) && (posix.isAbsolute(project) || win32.isAbsolute(project)),
    'Invalid original project path',
  );
  expect(Array.isArray(manifest.files) && manifest.files.length > 0, 'Manifest must describe at least one file');

  let total = 0;
  const files = manifest.files.map((entry) => {
    expect(exactFields(entry, ['path', 'bytes', 'sha256']) && hashShape(entry.sha256), 'Invalid manifest file entry');
    const path = filePath(entry.path);
    expect(path === entry.path && Number.isSafeInteger(entry.bytes) && entry.bytes >= 0, 'Invalid manifest file path or size');
    total += entry.bytes;
    expect(total <= MAX_BYTES, 'Checkpoint exceeds the 128 MiB data limit');
    return { path, bytes: entry.bytes, sha256: entry.sha256 };
  });

  checkCollisions(files.map(({ path }) => path));
  const body = manifestBody(project, files);
  expect(manifestDigest(body) === manifest.digest, 'Checkpoint manifest digest does not match');
  return { ...body, digest: manifest.digest };
}

function snapshotPaths(root, prefix = '') {
  const result = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const relativeName = prefix + entry.name;
    expect(relativeName === filePath(relativeName), 'Non-portable path in checkpoint payload');
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      const descendants = snapshotPaths(directory(join(root, entry.name)), `${relativeName}/`);
      expect(descendants.length > 0, 'Unexpected empty directory in checkpoint payload');
      result.push(...descendants);
    } else {
      expect(entry.isFile() && !entry.isSymbolicLink(), 'Unexpected link or non-file in checkpoint payload');
      result.push(relativeName);
    }
  }
  return result;
}

function verifiedSnapshot(value) {
  const snapshot = directory(value);
  expect(!gitMetadata(snapshot), 'Checkpoint directories cannot be inside Git metadata');
  try {
    expect(
      JSON.stringify(sorted(readdirSync(snapshot))) === JSON.stringify(['files', 'manifest.json']),
      'Checkpoint must contain only manifest.json and files/',
    );
    const manifest = validateManifest(
      JSON.parse(readRegular(join(snapshot, 'manifest.json'), MAX_MANIFEST).toString('utf8')),
    );
    const payload = directory(join(snapshot, 'files'));
    expect(
      JSON.stringify(sorted(snapshotPaths(payload))) === JSON.stringify(sorted(manifest.files.map(({ path }) => path))),
      'Checkpoint payload paths do not match the manifest',
    );
    const entries = manifest.files.map((entry) => {
      const data = readRegular(join(payload, ...entry.path.split('/')), entry.bytes, entry.bytes);
      expect(data.length === entry.bytes && sha256(data) === entry.sha256, `File integrity check failed: ${entry.path}`);
      expect(!hasCredential(data), `Credential-like content was refused in ${entry.path}`);
      return { ...entry, data };
    });
    return { snapshot, manifest, entries };
  } catch (error) {
    const detail = error instanceof SyntaxError ? 'Invalid manifest JSON' : error.message;
    throw new IntegrityError(`Checkpoint verification failed: ${detail}`);
  }
}

function writeNewTree(target, entries) {
  const created = [];
  const make = (path) => {
    directory(dirname(path));
    mkdirSync(path, { mode: 0o700 });
    created.push({ path, directory: true, info: lstatSync(path) });
  };

  try {
    make(target);
    for (const entry of entries) {
      const parts = entry.path.split('/');
      let parent = target;
      for (const part of parts.slice(0, -1)) {
        parent = join(parent, part);
        const stat = maybeStat(parent);
        if (stat) {
          expect(stat.isDirectory() && !stat.isSymbolicLink(), `Unsafe output directory: ${parent}`);
        } else {
          make(parent);
        }
      }

      const path = join(directory(parent), parts.at(-1));
      const fd = openSync(path, 'wx', 0o600);
      const item = { path, info: fstatSync(fd) };
      created.push(item);
      try {
        writeFileSync(fd, entry.data);
      } finally {
        try {
          item.info = fstatSync(fd);
        } finally {
          closeSync(fd);
        }
      }
    }
  } catch (error) {
    for (const item of created.reverse()) {
      try {
        directory(dirname(item.path));
        const info = lstatSync(item.path);
        if (info.isSymbolicLink() || info.dev !== item.info.dev || info.ino !== item.info.ino) {
          continue;
        }
        if (item.directory) {
          rmdirSync(item.path);
        } else if (info.size === item.info.size && info.mtimeMs === item.info.mtimeMs && info.ctimeMs === item.info.ctimeMs) {
          unlinkSync(item.path);
        }
      } catch {
        // Leave entries that can no longer be identified or safely removed.
      }
    }
    throw error;
  }
}

function create(config) {
  const project = directory(config.project);
  const home = realpathSync.native(homedir());
  expect(
    project !== dirname(project) && relative(project, home) !== '' && !gitMetadata(project),
    'Choose a project directory, not a filesystem root, home or Git metadata',
  );
  const snapshot = newDirectory(config.snapshot);
  expect(!within(project, snapshot), 'Choose a snapshot directory outside the project');

  const paths = sorted(config.files.map(filePath));
  checkCollisions(paths);
  const entries = metadata(project, paths);
  const body = manifestBody(project, entries.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })));
  const manifest = { ...body, digest: manifestDigest(body) };
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  expect(manifestBytes.length <= MAX_MANIFEST, 'Checkpoint manifest exceeds 4 MiB');

  if (!config.dryRun) {
    writeNewTree(snapshot, [
      ...entries.map(({ path, data }) => ({ path: `files/${path}`, data })),
      { path: 'manifest.json', data: manifestBytes },
    ]);
  }
  return { operation: 'create', ok: true, project, snapshot, dryRun: config.dryRun, digest: manifest.digest, files: manifest.files };
}

function run(config) {
  if (config.operation === 'create') {
    return create(config);
  }
  const { snapshot, manifest, entries } = verifiedSnapshot(config.snapshot);
  const report = { operation: config.operation, ok: true, snapshot, digest: manifest.digest, files: manifest.files };
  if (config.operation === 'verify') {
    return report;
  }

  const output = newDirectory(config.output);
  expect(!within(snapshot, output), 'Choose a recovery directory outside the snapshot');
  let origin = manifest.project;
  try {
    origin = realpathSync.native(manifest.project);
  } catch {
    // Keep recorded path if the original directory no longer exists.
  }
  expect(
    !isAbsolute(manifest.project) || (!within(manifest.project, output) && !within(origin, output)),
    'Choose a recovery directory outside the original project',
  );
  writeNewTree(output, entries);
  return { ...report, output };
}

function main(args) {
  try {
    const config = options(args);
    if (config.help) {
      console.log(usage);
      return;
    }
    expect(Number(process.versions.node.split('.')[0]) >= 20, 'Node.js 20 or newer is required');
    const result = run(config);
    if (config.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const action = result.dryRun ? 'Would copy' : { create: 'Copied', verify: 'Verified', recover: 'Recovered' }[result.operation];
      console.log(`${action} ${result.files.length} file(s) ${result.output ?? result.snapshot}`);
      console.log(`Checkpoint digest: ${result.digest}`);
      if (result.dryRun) {
        for (const file of result.files) {
          console.log(` - ${file.path} (${file.bytes} bytes)`);
        }
      }
    }
  } catch (error) {
    if (args.includes('--json')) {
      console.log(JSON.stringify({ operation: args[0], ok: false, error: error.message }));
    } else {
      console.error(`checkpoint: ${error.message}`);
    }
    process.exitCode = error instanceof IntegrityError ? 1 : 2;
  }
}

const isDirectRun = (url) => {
  try {
    return Boolean(process.argv[1]) && realpathSync.native(resolve(process.argv[1])) === realpathSync.native(fileURLToPath(url));
  } catch {
    return false;
  }
};

if (isDirectRun(import.meta.url)) {
  main(process.argv.slice(2));
}
