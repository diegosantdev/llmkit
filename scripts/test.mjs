#!/usr/bin/env node
// Expand test files explicitly; Windows shells and Node 20 do not handle globs alike.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directory = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(directory).filter((name) => name.endsWith('.test.mjs')).sort();

if (!files.length) {
  console.error('test: no test files found');
  process.exitCode = 1;
} else {
  const result = spawnSync(
    process.execPath,
    ['--test', ...files.map((name) => join(directory, name))],
    { stdio: 'inherit' },
  );
  if (result.error) {
    console.error(`test: ${result.error.message}`);
  }
  process.exitCode = result.status ?? 1;
}
