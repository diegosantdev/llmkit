#!/usr/bin/env node
// Aggregates human-reviewed evaluation observations against evals/cases.json.
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const text = (value) => typeof value === 'string' && value.trim().length > 0;

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Sort object keys recursively so harmless formatting changes do not invalidate a run.
function canonical(value) {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value && typeof value === 'object') {
    const sorted = Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]);
    return Object.fromEntries(sorted);
  }
  return value;
}

const suiteDigest = (suite) => 'sha256:' + createHash('sha256').update(JSON.stringify(canonical(suite))).digest('hex');

export function validateSuite(suite) {
  ensure(suite?.version === 1 && Array.isArray(suite.cases) && suite.cases.length > 0, 'Invalid evaluation suite');
  const ids = new Set();
  for (const item of suite.cases) {
    ensure(text(item.id) && !ids.has(item.id), 'Invalid or duplicate case id');
    ids.add(item.id);
    ensure(Array.isArray(item.skills) && item.skills.length > 0 && item.skills.every(text), `${item.id}: skills required`);
    ensure(text(item.setup) && text(item.prompt), `${item.id}: setup and prompt required`);
    ensure(Array.isArray(item.criteria) && item.criteria.length > 0, `${item.id}: criteria required`);
    const criteria = new Set();
    for (const criterion of item.criteria) {
      ensure(text(criterion.id) && !criteria.has(criterion.id), `${item.id}: invalid or duplicate criterion`);
      ensure(text(criterion.text) && typeof criterion.critical === 'boolean', `${item.id}: invalid criterion rubric`);
      criteria.add(criterion.id);
    }
  }
  return suite;
}

export function createTemplate(suite) {
  validateSuite(suite);
  return {
    version: 1,
    suiteDigest: suiteDigest(suite),
    run: { candidate: '', revision: '', environment: '', reviewer: '' },
    results: suite.cases.map((item) => ({
      caseId: item.id,
      criteria: item.criteria.map((criterion) => ({ id: criterion.id, status: 'not-run', evidence: '' })),
    })),
  };
}

export function score(suite, report) {
  validateSuite(suite);
  ensure(report?.version === 1 && Array.isArray(report.results), 'Invalid observations report');
  ensure(
    report.suiteDigest === suiteDigest(suite),
    'Report rubric differs from this suite; generate a new template and review the changed criteria',
  );
  for (const key of ['candidate', 'revision', 'environment', 'reviewer']) {
    ensure(text(report.run?.[key]), `run.${key} must identify the observed run`);
  }

  const knownCases = new Map(suite.cases.map((item) => [item.id, item]));
  const observed = new Map();
  for (const result of report.results) {
    const rubric = knownCases.get(result.caseId);
    ensure(rubric && !observed.has(result.caseId), `Unknown or duplicate case: ${result.caseId}`);
    ensure(Array.isArray(result.criteria), `${result.caseId}: criteria must be an array`);
    const knownCriteria = new Set(rubric.criteria.map((item) => item.id));
    const items = new Map();
    for (const item of result.criteria) {
      ensure(knownCriteria.has(item.id) && !items.has(item.id), `${result.caseId}: unknown or duplicate criterion ${item.id}`);
      ensure(['pass', 'fail', 'not-run'].includes(item.status), `${result.caseId}/${item.id}: invalid status`);
      ensure(typeof item.evidence === 'string', `${result.caseId}/${item.id}: evidence must be text`);
      ensure(item.status === 'not-run' || text(item.evidence), `${result.caseId}/${item.id}: reviewed outcomes require evidence`);
      items.set(item.id, item);
    }
    observed.set(result.caseId, items);
  }

  const totals = { pass: 0, fail: 0, notRun: 0, total: 0 };
  const criticalFailures = [];
  const cases = suite.cases.map((rubric) => {
    const counts = { pass: 0, fail: 0, notRun: 0 };
    for (const criterion of rubric.criteria) {
      const status = observed.get(rubric.id)?.get(criterion.id)?.status ?? 'not-run';
      const key = status === 'not-run' ? 'notRun' : status;
      counts[key]++;
      totals[key]++;
      totals.total++;
      if (status === 'fail' && criterion.critical) {
        criticalFailures.push(`${rubric.id}/${criterion.id}`);
      }
    }
    return { id: rubric.id, ...counts, passed: counts.fail === 0 && counts.notRun === 0 };
  });

  const reviewed = totals.pass + totals.fail;
  return {
    run: report.run,
    suiteDigest: report.suiteDigest,
    ...totals,
    coveragePercent: Number(((100 * reviewed) / totals.total).toFixed(1)),
    suitePassPercent: Number(((100 * totals.pass) / totals.total).toFixed(1)),
    observedPassPercent: reviewed ? Number(((100 * totals.pass) / reviewed).toFixed(1)) : null,
    criticalFailures,
    passed: totals.fail === 0 && totals.notRun === 0,
    cases,
    limitation: 'Human-reviewed observations; evidence text is not independently verified. No agent was executed by this scorer.',
  };
}

function main(args) {
  const suite = validateSuite(JSON.parse(readFileSync(resolve(root, 'evals/cases.json'), 'utf8')));
  const [mode = 'list', ...rest] = args;
  if (mode === 'list' && rest.length === 0) {
    for (const item of suite.cases) {
      console.log(`${item.id}: ${item.skills.join(', ')} (${item.criteria.length} criteria)`);
    }
    return 0;
  }
  if (mode === 'template' && (rest.length === 0 || (rest.length === 2 && rest[0] === '--output'))) {
    const json = JSON.stringify(createTemplate(suite), null, 2) + '\n';
    if (rest.length) {
      writeFileSync(resolve(rest[1]), json, { flag: 'wx' });
      console.log(`Created ${resolve(rest[1])}; fill run metadata and reviewed evidence before scoring.`);
    } else {
      process.stdout.write(json);
    }
    return 0;
  }
  if (mode === 'score' && (rest.length === 1 || (rest.length === 2 && rest[1] === '--json'))) {
    const result = score(suite, JSON.parse(readFileSync(resolve(rest[0]), 'utf8')));
    if (rest[1] === '--json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Reviewed ${result.pass + result.fail}/${result.total} criteria (${result.coveragePercent}% coverage)`);
      console.log(`Pass ${result.pass}; fail ${result.fail}; not run ${result.notRun}. Suite pass: ${result.suitePassPercent}%.`);
      if (result.criticalFailures.length) {
        console.log(`Critical failures: ${result.criticalFailures.join(', ')}`);
      }
      console.log(result.passed ? 'All suite criteria recorded as passing.' : 'Suite incomplete or failing.');
      console.log(result.limitation);
    }
    return result.passed ? 0 : 1;
  }
  throw new Error('Usage: evaluate.mjs list | template [--output <new-file>] | score <observations.json> [--json]');
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
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`evals: ${error.message}`);
    process.exitCode = 2;
  }
}
