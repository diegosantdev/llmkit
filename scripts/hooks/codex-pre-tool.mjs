// Codex PreToolUse adapter. Keeps Codex payloads separate from Claude's write shapes.
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from './guard-bash.mjs';
import { scan } from './secret-scan.mjs';

// Inspect only added lines so removing an existing secret in a patch stays allowed.
export function addedPatchContent(command) {
  if (typeof command !== 'string') {
    return '';
  }
  const lines = command.replace(/\r\n/g, '\n').trimEnd().split('\n');
  if (lines[0] !== '*** Begin Patch' || lines.at(-1) !== '*** End Patch') {
    return '';
  }

  let writes = false;
  const additions = [];
  for (const line of lines.slice(1, -1)) {
    if (/^\*\*\* (?:Add|Update) File: ./.test(line)) {
      writes = true;
    } else if (line.startsWith('*** Delete File: ')) {
      writes = false;
    } else if (writes && line.startsWith('+')) {
      additions.push(line.slice(1));
    }
  }
  return additions.join('\n');
}

export function denyReason(input, { windows = process.platform === 'win32', env = process.env } = {}) {
  if (input?.hook_event_name !== 'PreToolUse') {
    return null;
  }
  const command = input.tool_input?.command;
  if (input.tool_name === 'Bash' && env.LLMKIT_GUARD !== 'off') {
    const result = check(command, 0, windows);
    return result ? `llmkit blocked a shell command (${result.id}): ${result.why}.` : null;
  }
  if (input.tool_name === 'apply_patch' && env.LLMKIT_SECRET_SCAN !== 'off') {
    const hits = scan(addedPatchContent(command));
    if (hits.length > 0) {
      return `llmkit blocked credential-shaped patch additions (${hits.join(', ')}). Use a secret manager or an incomplete placeholder.`;
    }
  }
  return null;
}

export function run() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return;
  }
  const reason = denyReason(input);
  if (!reason) {
    return;
  }
  const payload = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
  process.stdout.write(JSON.stringify(payload) + '\n');
}

const isDirectRun = (url) => {
  try {
    return Boolean(process.argv[1]) && realpathSync.native(resolve(process.argv[1])) === realpathSync.native(fileURLToPath(url));
  } catch {
    return false;
  }
};

if (isDirectRun(import.meta.url)) {
  run();
}
