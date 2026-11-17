import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createTemplate, score, validateSuite } from './evaluate.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'scripts/evaluate.mjs');
const suite = JSON.parse(readFileSync(join(root, 'evals/cases.json'), 'utf8'));
const metadata = { candidate: 'fixture', revision: 'fixture-v1', environment: 'isolated', reviewer: 'test fixture' };
const report = () => ({ ...createTemplate(suite), run: { ...metadata } });

test('an untouched template has zero coverage and cannot pass', () => {
  const result = score(suite, report());
  assert.equal(result.coveragePercent, 0);
  assert.equal(result.passed, false);
  assert.equal(result.observedPassPercent, null);
  assert.equal(result.notRun, result.total);
});

test('one passing case does not become a passing full suite', () => {
  const input = report();
  input.results = [input.results[0]];
  input.results[0].criteria = input.results[0].criteria.map((item) => ({ ...item, status: 'pass', evidence: 'Observed fixture behavior at artifact:12' }));
  const result = score(suite, input);
  assert.equal(result.observedPassPercent, 100);
  assert.ok(result.suitePassPercent < 100);
  assert.ok(result.coveragePercent < 100);
  assert.equal(result.passed, false);
});

test('a missing criterion is not-run even in a submitted case', () => {
  const input = report();
  input.results[0].criteria = [];
  assert.equal(score(suite, input).notRun, score(suite, report()).total);
});

test('critical failures are exposed and cannot be outweighed by other passes', () => {
  const input = report();
  for (const result of input.results) {
    for (const item of result.criteria) Object.assign(item, { status: 'pass', evidence: 'Reviewed fixture transcript' });
  }
  const rubric = suite.cases.find((item) => item.criteria.some((criterion) => criterion.critical));
  const criterion = rubric.criteria.find((item) => item.critical);
  input.results.find((item) => item.caseId === rubric.id).criteria.find((item) => item.id === criterion.id).status = 'fail';
  const result = score(suite, input);
  assert.equal(result.passed, false);
  assert.equal(result.coveragePercent, 100);
  assert.deepEqual(result.criticalFailures, [`${rubric.id}/${criterion.id}`]);
});

test('reviewed outcomes require evidence and run provenance', () => {
  const input = report();
  input.results[0].criteria[0].status = 'pass';
  assert.throws(() => score(suite, input), /require evidence/);
  input.results[0].criteria[0].evidence = 'Observed';
  input.run.reviewer = '';
  assert.throws(() => score(suite, input), /run.reviewer/);
});

test('unknown or duplicate observations and invalid statuses are rejected', () => {
  const duplicate = report();
  duplicate.results.push(duplicate.results[0]);
  assert.throws(() => score(suite, duplicate), /duplicate case/);
  const unknown = report();
  unknown.results[0].caseId = 'invented';
  assert.throws(() => score(suite, unknown), /Unknown/);
  const invalid = report();
  invalid.results[0].criteria[0].status = 'probably';
  assert.throws(() => score(suite, invalid), /invalid status/);
  const criterion = report();
  criterion.results[0].criteria.push(criterion.results[0].criteria[0]);
  assert.throws(() => score(suite, criterion), /duplicate criterion/);
});

test('malformed rubrics fail instead of yielding a misleading score', () => {
  const duplicate = structuredClone(suite);
  duplicate.cases.push(duplicate.cases[0]);
  assert.throws(() => validateSuite(duplicate), /duplicate case/);
  assert.throws(() => validateSuite({ version: 1, cases: [] }), /Invalid/);
});

test('recorded passes are bound to the exact rubric, not just matching criterion ids', () => {
  const input = report();
  for (const result of input.results) {
    for (const item of result.criteria) Object.assign(item, { status: 'pass', evidence: 'Synthetic reviewed evidence' });
  }
  assert.equal(score(suite, input).passed, true);
  const changed = structuredClone(suite);
  changed.cases[0].criteria[0].text = 'A materially different acceptance criterion';
  assert.throws(() => score(changed, input), /rubric differs/);
  const reordered = { cases: suite.cases, description: suite.description, version: suite.version };
  assert.equal(score(reordered, input).passed, true);
  delete input.suiteDigest;
  assert.throws(() => score(suite, input), /rubric differs/);
});

test('template output refuses overwrite; incomplete scores exit nonzero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'llmkit-eval-'));
  try {
    const output = join(dir, 'review.json');
    const first = spawnSync(process.execPath, [cli, 'template', '--output', output], { encoding: 'utf8' });
    assert.equal(first.status, 0, first.stderr);
    const original = readFileSync(output, 'utf8');
    const second = spawnSync(process.execPath, [cli, 'template', '--output', output], { encoding: 'utf8' });
    assert.equal(second.status, 2);
    assert.equal(readFileSync(output, 'utf8'), original);
    const input = JSON.parse(original);
    input.run = metadata;
    writeFileSync(output, JSON.stringify(input));
    const incomplete = spawnSync(process.execPath, [cli, 'score', output, '--json'], { encoding: 'utf8' });
    assert.equal(incomplete.status, 1, incomplete.stderr);
    assert.equal(JSON.parse(incomplete.stdout).passed, false);
    const wrongArgs = spawnSync(process.execPath, [cli, 'score', output, '--silent'], { encoding: 'utf8' });
    assert.equal(wrongArgs.status, 2);
  } finally {
    assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')));
    rmSync(dir, { recursive: true, force: true });
  }
});
