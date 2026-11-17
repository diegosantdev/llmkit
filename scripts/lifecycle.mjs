// Project-local ownership ledger and atomic file writes.
import {
  chmodSync,
  closeSync,
  constants,
  copyFileSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const ledgerPath = '.llmkit/install.json';
const lockPath = '.llmkit/install.lock';
const ledgerFormat = 'llmkit-install';

export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function matchesRecorded(path, bytes, recordedHash) {
  if (digest(bytes) === recordedHash) {
    return true;
  }
  if (/\.md$/i.test(path)) {
    const lf = Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
    const crlf = Buffer.from(lf.toString('latin1').replace(/\n/g, '\r\n'), 'latin1');
    return digest(lf) === recordedHash || digest(crlf) === recordedHash;
  }
  return false;
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

function isWithin(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

// Refuse links and junctions anywhere beneath root, including the ledger and lock.
export function checkDestination(root, path) {
  if (!isWithin(root, path) || path === root) {
    throw new Error('Destination escapes the selected project');
  }
  if (!lstatSync(root).isDirectory()) {
    throw new Error('Selected project is no longer a regular directory');
  }
  const segments = relative(root, path).split(sep);
  let current = root;
  for (let i = 0; i < segments.length; i++) {
    current = join(current, segments[i]);
    const stat = maybeStat(current);
    if (!stat) {
      return null;
    }
    if (stat.isSymbolicLink()) {
      throw new Error(`Symbolic link destination refused: ${relative(root, current)}`);
    }
    if (i === segments.length - 1) {
      if (!stat.isFile()) {
        throw new Error(`Destination is not a regular file: ${relative(root, current)}`);
      }
      return stat;
    }
    if (!stat.isDirectory()) {
      throw new Error(`Parent is not a directory: ${relative(root, current)}`);
    }
  }
  return null;
}

export function readDestination(root, path) {
  const stat = checkDestination(root, path);
  return stat ? { bytes: readFileSync(path), mode: stat.mode & 0o777 } : null;
}

export function isManagedPath(path) {
  return (
    /^(?:\.agents\/skills|\.claude\/(?:skills|agents|commands\/llmkit))\//.test(path) &&
    !/[\\:\0]/.test(path) &&
    path.split('/').every((part) => part && part !== '.' && part !== '..')
  );
}

export function readLedger(root) {
  const snapshot = readDestination(root, join(root, ledgerPath));
  if (!snapshot) {
    return { snapshot, files: Object.create(null) };
  }
  try {
    const data = JSON.parse(snapshot.bytes.toString('utf8'));
    if (
      data?.format !== ledgerFormat ||
      data.version !== 1 ||
      !data.files ||
      typeof data.files !== 'object' ||
      Array.isArray(data.files)
    ) {
      throw new Error('unsupported format');
    }
    const files = Object.create(null);
    for (const [path, hash] of Object.entries(data.files)) {
      if (!isManagedPath(path) || typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) {
        throw new Error('invalid file record');
      }
      files[path] = hash;
    }
    return { snapshot, files };
  } catch (error) {
    throw new Error(`Cannot use ${ledgerPath}: ${error.message}. No managed files were changed.`);
  }
}

function createParents(root, directory, created) {
  if (directory === root) {
    return;
  }
  if (!isWithin(root, directory)) {
    throw new Error('Parent escapes the selected project');
  }
  const stat = maybeStat(directory);
  if (stat) {
    if (!stat.isDirectory()) {
      throw new Error(`Unsafe parent directory: ${directory}`);
    }
    return;
  }
  createParents(root, dirname(directory), created);
  mkdirSync(directory);
  created.push(directory);
}

const sameSnapshot = (a, b) => (a && b ? a.mode === b.mode && a.bytes.equals(b.bytes) : a === b);

function replace(root, path, bytes, previous, mode) {
  const temporary = join(dirname(path), `.llmkit-${randomUUID()}.tmp`);
  let created = false;
  try {
    checkDestination(root, temporary);
    const fd = openSync(temporary, 'wx', mode);
    created = true;
    try {
      writeFileSync(fd, bytes);
    } finally {
      closeSync(fd);
    }
    if (process.platform !== 'win32') {
      chmodSync(temporary, mode);
    }
    const current = readDestination(root, path);
    if (!sameSnapshot(current, previous)) {
      throw new Error(`File changed after preflight: ${relative(root, path)}`);
    }
    if (previous) {
      renameSync(temporary, path);
      created = false;
    } else {
      copyFileSync(temporary, path, constants.COPYFILE_EXCL);
    }
  } finally {
    if (created) {
      try {
        if (checkDestination(root, temporary)) {
          unlinkSync(temporary);
        }
      } catch {
        // Leave moved or inaccessible paths untouched.
      }
    }
  }
}

function withInstallLock(root, ledger, fn) {
  const stateFile = join(root, ledgerPath);
  const lock = join(root, lockPath);
  const createdDirectories = [];
  let lockStat;
  let failure;

  try {
    checkDestination(root, lock);
    createParents(root, dirname(lock), createdDirectories);
    checkDestination(root, lock);
    let fd;
    try {
      fd = openSync(lock, 'wx', 0o600);
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw new Error(`Setup lock exists at ${lockPath}; finish the other setup or inspect a stale lock before retrying`);
      }
      throw error;
    }
    try {
      lockStat = fstatSync(fd, { bigint: true });
    } finally {
      closeSync(fd);
    }
    if (!sameSnapshot(readDestination(root, stateFile), ledger.snapshot)) {
      throw new Error('Install ledger changed after preflight; rerun setup');
    }
    return fn({ stateFile, createdDirectories });
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    if (lockStat) {
      try {
        checkDestination(root, lock);
        const current = lstatSync(lock, { bigint: true });
        if (current.dev === lockStat.dev && current.ino === lockStat.ino) {
          unlinkSync(lock);
        }
      } catch {
        // An interrupted or inaccessible lock needs manual inspection.
      }
    }
    if (failure) {
      for (const directory of createdDirectories.reverse()) {
        try {
          checkDestination(root, join(directory, '.llmkit-rollback-check'));
          if (lstatSync(directory).isDirectory()) {
            rmdirSync(directory);
          }
        } catch {
          // Leave non-empty or linked directories untouched.
        }
      }
    }
  }
}

export function applyChanges(plan, changes) {
  const { root, ledger } = plan;
  withInstallLock(root, ledger, ({ stateFile, createdDirectories }) => {
    const applied = [];
    try {
      const records = { ...ledger.files };
      for (const file of changes) {
        const previous = readDestination(root, file.destination);
        const matchesPrevious =
          file.status === 'missing'
            ? previous === null
            : Boolean(previous && matchesRecorded(file.path, previous.bytes, ledger.files[file.path]));
        if (!matchesPrevious) {
          throw new Error(`File changed after preflight: ${file.path}`);
        }
        createParents(root, dirname(file.destination), createdDirectories);
        const mode = previous?.mode ?? file.sourceMode;
        replace(root, file.destination, file.sourceBytes, previous, mode);
        applied.push({ file, previous, mode });
        records[file.path] = digest(file.sourceBytes);
      }

      const files = Object.fromEntries(Object.entries(records).sort(([a], [b]) => a.localeCompare(b, 'en')));
      const state = Buffer.from(JSON.stringify({ format: ledgerFormat, version: 1, files }, null, 2) + '\n');
      // Commit the ledger last so an earlier failure preserves prior ownership records.
      replace(root, stateFile, state, ledger.snapshot, ledger.snapshot?.mode ?? 0o644);
    } catch (error) {
      const skipped = [];
      for (const { file, previous, mode } of applied.reverse()) {
        try {
          const current = readDestination(root, file.destination);
          if (!current || !current.bytes.equals(file.sourceBytes) || (process.platform !== 'win32' && current.mode !== mode)) {
            throw new Error('File no longer matches this install');
          }
          if (previous) {
            replace(root, file.destination, previous.bytes, current, previous.mode);
          } else {
            unlinkSync(file.destination);
          }
        } catch {
          skipped.push(file.path);
        }
      }
      const rollback = skipped.length
        ? `Rollback could not restore these paths safely: ${skipped.join(', ')}`
        : 'Applied changes were rolled back';
      throw new Error(`Installation failed: ${error.message}. ${rollback}.`);
    }
  });
}

function pruneEmptyDirectories(root, directories) {
  const ordered = [...new Set(directories)].sort((a, b) => b.length - a.length || b.localeCompare(a, 'en'));
  for (const directory of ordered) {
    if (!isWithin(root, directory) || directory === root) {
      continue;
    }
    try {
      checkDestination(root, join(directory, '.llmkit-prune-check'));
      if (maybeStat(directory)?.isDirectory()) {
        rmdirSync(directory);
      }
    } catch {
      // Non-empty, missing or linked directories stay intact.
    }
  }
}

export function applyRemovals(plan, removals, absent = []) {
  const { root, ledger } = plan;
  const candidateDirs = [];
  const collectParents = (file) => {
    for (let dir = dirname(file.destination); dir !== root && isWithin(root, dir); dir = dirname(dir)) {
      candidateDirs.push(dir);
    }
  };
  let removeLedger = false;

  withInstallLock(root, ledger, ({ stateFile }) => {
    const removed = [];
    try {
      const records = { ...ledger.files };
      for (const file of removals) {
        const current = readDestination(root, file.destination);
        if (!current || !matchesRecorded(file.path, current.bytes, ledger.files[file.path])) {
          throw new Error(`File changed after preflight: ${file.path}`);
        }
        unlinkSync(file.destination);
        removed.push({ file, previous: current });
        delete records[file.path];
        collectParents(file);
      }

      for (const file of absent) {
        if (readDestination(root, file.destination) !== null) {
          throw new Error(`File appeared after preflight: ${file.path}`);
        }
        delete records[file.path];
        collectParents(file);
      }

      const remaining = Object.entries(records).sort(([a], [b]) => a.localeCompare(b, 'en'));
      if (remaining.length === 0) {
        const currentLedger = readDestination(root, stateFile);
        if (!sameSnapshot(currentLedger, ledger.snapshot)) {
          throw new Error('Install ledger changed after preflight; rerun setup');
        }
        if (currentLedger) {
          unlinkSync(stateFile);
        }
        removeLedger = true;
      } else {
        const state = Buffer.from(
          JSON.stringify({ format: ledgerFormat, version: 1, files: Object.fromEntries(remaining) }, null, 2) + '\n',
        );
        replace(root, stateFile, state, ledger.snapshot, ledger.snapshot?.mode ?? 0o644);
      }
    } catch (error) {
      const skipped = [];
      for (const { file, previous } of removed.reverse()) {
        try {
          if (readDestination(root, file.destination) !== null) {
            throw new Error('Destination reappeared during rollback');
          }
          replace(root, file.destination, previous.bytes, null, previous.mode);
        } catch {
          skipped.push(file.path);
        }
      }
      const rollback = skipped.length
        ? `Rollback could not restore these paths safely: ${skipped.join(', ')}`
        : 'Applied changes were rolled back';
      throw new Error(`Uninstall failed: ${error.message}. ${rollback}.`);
    }
  });

  if (removeLedger) {
    candidateDirs.push(dirname(join(root, ledgerPath)));
  }
  pruneEmptyDirectories(root, candidateDirs);
}
