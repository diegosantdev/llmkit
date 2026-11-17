#!/usr/bin/env node
// PreToolUse hook for Write/Edit/MultiEdit. Blocks content that looks like a real credential.
// Exit code 2 blocks the tool call. The matched secret is never printed.
// Escape hatch: set LLMKIT_SECRET_SCAN=off in the environment.
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PATTERNS = [
  { id: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/ },
  { id: 'private-key-block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/ },
  { id: 'stripe-live-key', re: /\b[sr]k_live_[A-Za-z0-9]{20,}\b/ },
  { id: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { id: 'openai-style-key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { id: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { id: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/ },
  { id: 'npm-token', re: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { id: 'gitlab-pat', re: /\bglpat-[A-Za-z0-9_-]{20,}\b/ },
  { id: 'huggingface-token', re: /\bhf_[A-Za-z0-9]{30,}\b/ },
  { id: 'sendgrid-key', re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/ },
  { id: 'pypi-token', re: /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}\b/ },
  {
    id: 'db-connection-uri',
    re: /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?):\/\/[^:\s/]+:(?!(?:<[^>]*>|\$\{[^}]+\}|your[_-][^@]*|changeme|password|postgres|example|placeholder|dummy|x+|test|dev)@)[^@\s<>{}$]{8,}@(?!localhost(?::\d+)?(?:[/?#\s]|$)|127\.0\.0\.1(?::\d+)?(?:[/?#\s]|$)|\[::1\](?::\d+)?(?:[/?#\s]|$)|0\.0\.0\.0(?::\d+)?(?:[/?#\s]|$)|(?:db|postgres|redis|mysql|mongo)(?::\d+)?(?:[/?#\s]|$)|(?:[^@\s/]+\.)?example\.(?:com|org|net|invalid)(?::\d+)?(?:[/?#\s]|$))[^\s/]+/i,
  },
];

export function scan(text) {
  if (typeof text !== 'string' || text.length === 0) return [];
  // Filenames, comments and nearby placeholder words cannot establish that a
  // credential-shaped value is safe. Use visibly incomplete placeholders instead.
  return PATTERNS.filter((p) => p.re.test(text)).map((p) => p.id);
}

export function collectContent(toolInput = {}) {
  if (!toolInput || typeof toolInput !== 'object') return '';
  const parts = [];
  if (typeof toolInput.content === 'string') parts.push(toolInput.content);
  if (typeof toolInput.new_string === 'string') parts.push(toolInput.new_string);
  if (Array.isArray(toolInput.edits)) {
    for (const e of toolInput.edits) if (typeof e?.new_string === 'string') parts.push(e.new_string);
  }
  return parts.join('\n');
}

function main() {
  if (process.env.LLMKIT_SECRET_SCAN === 'off') process.exit(0);
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }
  const tool = input?.tool_name;
  if (!['Write', 'Edit', 'MultiEdit'].includes(tool)) process.exit(0);
  const hits = scan(collectContent(input.tool_input));
  if (hits.length === 0) process.exit(0);
  process.stderr.write(
    `llmkit secret-scan blocked a file write: content looks like a credential (${hits.join(', ')}).\n` +
      `Use an environment variable or a secret manager instead, and put a placeholder in .env.example. ` +
      `If this was a real secret, it must be rotated.\n`,
  );
  process.exit(2);
}

const isDirectRun = (url) => {
  try {
    return Boolean(process.argv[1]) && realpathSync.native(resolve(process.argv[1])) === realpathSync.native(fileURLToPath(url));
  } catch {
    return false;
  }
};

if (isDirectRun(import.meta.url)) main();
