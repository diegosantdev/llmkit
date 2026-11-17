import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const cli = fileURLToPath(new URL('./checkpoint.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [cli, ...args, '--json'], { encoding: 'utf8' });
const body = (result, expected = 0) => {
  assert.equal(result.status, expected, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};
const digest = (value) => createHash('sha256').update(value).digest('hex');

function fixture(t) {
  const parent = realpathSync(tmpdir());
  const root = mkdtempSync(join(parent, 'llmkit-checkpoint-'));
  t.after(() => {
    const rel = relative(parent, realpathSync(root));
    assert.ok(rel.startsWith('llmkit-checkpoint-') && !rel.includes(sep));
    rmSync(root, { recursive: true, force: true });
  });
  const project = join(root, 'project space');
  mkdirSync(project);
  return { root, project, snapshot: join(root, 'snapshot space'), output: join(root, 'recovered space') };
}

function write(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

const create = ({ project, snapshot }, ...files) => run('create', '--project', project, '--snapshot', snapshot, ...files.flatMap((path) => ['--file', path]));

test('a checkpoint recovers exact working bytes without changing staged, dirty or untracked work', (t) => {
  if (spawnSync('git', ['--version'], { stdio: 'ignore' }).error?.code === 'ENOENT') { t.skip('Git is not installed'); return; }
  const f = fixture(t);
  const template = join(f.root, 'empty-template');
  mkdirSync(template);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(f.root, 'no-global-config') });
  const git = (...args) => {
    const result = spawnSync('git', ['--no-optional-locks', '-C', f.project, '-c', 'core.autocrlf=false', ...args], { encoding: 'utf8', env });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout;
  };
  git('init', `--template=${template}`);
  const dirty = join(f.project, 'src', 'user work.txt');
  const untracked = join(f.project, 'notes.bin');
  write(dirty, 'original\n');
  write(join(f.project, 'not-selected.txt'), 'not selected\n');
  git('add', '--', 'src/user work.txt', 'not-selected.txt');
  git('-c', 'user.name=Test Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture');
  write(dirty, 'staged only\n');
  git('add', '--', 'src/user work.txt');
  const captured = Buffer.from('working copy\r\n');
  write(dirty, captured);
  const bytes = Buffer.from([0, 255, 13, 10, 128, 0]);
  write(untracked, bytes);
  const state = () => ({
    head: git('rev-parse', 'HEAD'), branch: git('symbolic-ref', 'HEAD'),
    status: git('status', '--porcelain=v1', '--untracked-files=all'),
    staged: git('diff', '--cached'), dirty: git('diff'),
    index: readFileSync(join(f.project, '.git', 'index')),
  });
  const before = state();
  assert.match(before.status, /^MM /m);
  assert.match(before.status, /^\?\? notes\.bin$/m);

  const dry = body(run('create', '--project', f.project, '--snapshot', f.snapshot,
    '--file', './src/user work.txt', '--file', 'notes.bin', '--dry-run'));
  assert.equal(dry.dryRun, true);
  assert.ok(!existsSync(f.snapshot));
  const saved = body(create(f, 'src\\user work.txt', 'notes.bin'));
  assert.equal(saved.digest, dry.digest);
  assert.deepEqual(saved.files.map((file) => file.path), ['notes.bin', 'src/user work.txt']);
  assert.equal(saved.files[0].sha256, digest(bytes));
  assert.equal(body(run('verify', '--snapshot', f.snapshot)).digest, saved.digest);
  assert.ok(!existsSync(join(f.snapshot, 'files', '.git')));
  assert.ok(!existsSync(join(f.snapshot, 'files', 'not-selected.txt')));
  assert.deepEqual(state(), before);

  write(dirty, 'newer user work\n');
  const newer = state();
  const restored = body(run('recover', '--snapshot', f.snapshot, '--output', f.output));
  assert.equal(restored.digest, saved.digest);
  assert.deepEqual(readFileSync(join(f.output, 'src', 'user work.txt')), captured);
  assert.deepEqual(readFileSync(join(f.output, 'notes.bin')), bytes);
  assert.equal(readFileSync(dirty, 'utf8'), 'newer user work\n');
  assert.deepEqual(state(), newer);
});

test('unsafe paths and existing or in-project destinations never cause a write', (t) => {
  const f = fixture(t);
  const file = join(f.project, 'safe.txt');
  write(file, 'plain text');
  write(join(f.project, '.env.local'), 'CONFIG=placeholder');
  write(join(f.project, '.git', 'index'), 'fixture metadata');
  for (const path of ['../outside', 'C:\\outside.txt', 'src/../safe.txt', 'safe.txt:stream', 's*.txt', '.git/index', '.env.local', '.git', 'CON.txt']) {
    assert.equal(body(create(f, path), 2).ok, false, path);
    assert.ok(!existsSync(f.snapshot));
  }
  assert.match(body(create(f, 'safe.txt', 'SAFE.txt'), 2).error, /colliding/);
  assert.match(body(create({ ...f, snapshot: join(f.project, 'inside') }, 'safe.txt'), 2).error, /outside the project/);
  assert.ok(!existsSync(join(f.project, 'inside')));
  const key = 'gh' + 'p_' + 'z'.repeat(36);
  write(join(f.project, 'unsafe.txt'), `TOKEN=${key}`);
  const secret = body(create(f, 'safe.txt', 'unsafe.txt'), 2);
  assert.match(secret.error, /Credential-like/);
  assert.ok(!secret.error.includes(key));
  assert.ok(!existsSync(f.snapshot));
  // Windows PowerShell commonly writes UTF-16LE with a byte-order mark.
  write(join(f.project, 'unsafe.txt'), Buffer.from(`\uFEFFTOKEN=${key}`, 'utf16le'));
  assert.match(body(create(f, 'unsafe.txt'), 2).error, /Credential-like/);
  assert.ok(!existsSync(f.snapshot));

  body(create(f, 'safe.txt'));
  const manifest = readFileSync(join(f.snapshot, 'manifest.json'));
  assert.match(body(create(f, 'safe.txt'), 2).error, /must be new/);
  assert.deepEqual(readFileSync(join(f.snapshot, 'manifest.json')), manifest);
  assert.match(body(run('recover', '--snapshot', f.snapshot, '--output', join(f.project, 'inside')), 2).error, /outside the original project/);
  assert.match(body(run('recover', '--snapshot', f.snapshot, '--output', join(f.snapshot, 'inside')), 2).error, /outside the snapshot/);
  assert.ok(!existsSync(join(f.project, 'inside')));
  assert.ok(!existsSync(join(f.snapshot, 'inside')));
  write(join(f.output, 'keep.txt'), 'preserve existing');
  assert.match(body(run('recover', '--snapshot', f.snapshot, '--output', f.output), 2).error, /must be new/);
  assert.equal(readFileSync(join(f.output, 'keep.txt'), 'utf8'), 'preserve existing');
  assert.ok(!existsSync(join(f.output, 'safe.txt')));
});

test('junctions, symlinks and hardlinks are refused for source paths or output parents', (t) => {
  const f = fixture(t);
  const outside = join(f.root, 'outside');
  const alias = join(f.project, 'alias');
  const original = join(outside, 'private.txt');
  write(original, 'outside content');
  write(join(f.project, 'safe.txt'), 'project content');
  try { symlinkSync(outside, alias, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Links are not available in this environment'); return; }
    throw error;
  }
  assert.match(body(create(f, 'alias/private.txt'), 2).error, /without links/);
  assert.match(body(create({ ...f, snapshot: join(alias, 'new') }, 'safe.txt'), 2).error, /without links/);
  assert.match(body(create({ ...f, project: alias }, 'private.txt'), 2).error, /without links/);
  assert.ok(!existsSync(join(outside, 'new')));
  assert.ok(!existsSync(f.snapshot));
  linkSync(original, join(f.project, 'hardlink.txt'));
  assert.match(body(create(f, 'hardlink.txt'), 2).error, /without links/);
  body(create(f, 'safe.txt'));
  assert.match(body(run('recover', '--snapshot', f.snapshot, '--output', join(alias, 'new')), 2).error, /without links/);
  assert.ok(!existsSync(join(outside, 'new')));
});

test('verification refuses altered bytes, malicious manifest paths and unexpected payloads before recovery writes', (t) => {
  const f = fixture(t);
  write(join(f.project, 'safe.txt'), 'abc');
  body(create(f, 'safe.txt'));
  const dataPath = join(f.snapshot, 'files', 'safe.txt');
  const manifestPath = join(f.snapshot, 'manifest.json');
  const original = readFileSync(manifestPath, 'utf8');
  const reject = (pattern) => {
    assert.match(body(run('verify', '--snapshot', f.snapshot), 1).error, pattern);
    assert.match(body(run('recover', '--snapshot', f.snapshot, '--output', f.output), 1).error, pattern);
    assert.ok(!existsSync(f.output));
  };
  writeFileSync(dataPath, 'xyz');
  reject(/File integrity check failed/);
  writeFileSync(dataPath, 'abcd');
  reject(/size does not match/);
  writeFileSync(dataPath, 'abc');
  const altered = JSON.parse(original);
  altered.files[0].sha256 = '0'.repeat(64);
  writeFileSync(manifestPath, JSON.stringify(altered));
  reject(/manifest digest/);
  for (const path of ['../safe.txt', 'nested/../../safe.txt', 'C:/outside.txt', '.git/index']) {
    const { digest: ignored, ...malicious } = JSON.parse(original);
    malicious.files[0].path = path;
    writeFileSync(manifestPath, JSON.stringify({ ...malicious, digest: digest(JSON.stringify(malicious)) }));
    reject(/project-relative|excluded/);
  }
  writeFileSync(manifestPath, '{');
  reject(/Invalid manifest JSON/);
  writeFileSync(manifestPath, original);
  write(join(f.snapshot, 'files', 'extra.txt'), 'unexpected');
  reject(/paths do not match/);
});

test('the CLI requires an explicit file selection and never infers a project', (t) => {
  const f = fixture(t);
  assert.match(body(run('create', '--project', f.project, '--snapshot', f.snapshot), 2).error, /at least one explicit/);
  assert.match(body(run('verify'), 2).error, /--snapshot is required/);
  assert.match(body(run('recover', '--snapshot', f.snapshot), 2).error, /--output is required/);
  assert.ok(!existsSync(f.snapshot));
});

test('canonical project path checks resist Windows 8.3 short-path mismatches', (t) => {
  const f = fixture(t);
  write(join(f.project, 'safe.txt'), 'abc');
  const nativeTemp = realpathSync.native(tmpdir());
  const rawTemp = tmpdir();
  if (process.platform === 'win32' && rawTemp !== nativeTemp) {
    const shortProject = join(rawTemp, relative(nativeTemp, realpathSync.native(f.project)));
    const nativeOutputInside = join(realpathSync.native(f.project), 'recovered-inside');
    const saved = body(create({ project: shortProject, snapshot: f.snapshot }, 'safe.txt'));
    assert.equal(saved.project, realpathSync.native(f.project));
    assert.match(body(run('recover', '--snapshot', f.snapshot, '--output', nativeOutputInside), 2).error, /outside the original project/);
    assert.ok(!existsSync(nativeOutputInside));
  }
  if (process.platform === 'win32' && !/[&|<>^"]/.test(homedir())) {
    const homeProbe = spawnSync('cmd.exe', ['/d', '/c', `for %I in ("${homedir()}") do @echo %~sI`], { windowsVerbatimArguments: true, encoding: 'utf8' });
    const shortHome = homeProbe.stdout?.trim();
    if (shortHome && shortHome !== realpathSync.native(homedir()) && existsSync(shortHome)) {
      assert.match(body(create({ project: shortHome, snapshot: join(f.root, 'home-snap') }, '.bashrc'), 2).error, /not a filesystem root, home/);
    }
  }
});

test('running checkpoint through a symlinked bin wrapper invokes the CLI', (t) => {
  const f = fixture(t);
  const linked = join(f.root, 'llmkit-checkpoint.mjs');
  try {
    symlinkSync(cli, linked, 'file');
  } catch (error) {
    if (['EPERM', 'EACCES'].includes(error.code)) {
      t.skip('File symlinks are not permitted in this environment');
      return;
    }
    throw error;
  }
  const result = spawnSync(process.execPath, [linked, '--help'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage:.*checkpoint\.mjs create/);
});
