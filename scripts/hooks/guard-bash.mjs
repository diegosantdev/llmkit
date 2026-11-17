#!/usr/bin/env node
// PreToolUse hook for Bash and PowerShell. Guards against literal catastrophic
// commands; set LLMKIT_GUARD=off to disable in the current session.
import { readFileSync, realpathSync } from 'node:fs';
import { posix, resolve, win32 } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RULES = [
  { id: 'rm-root-or-home', why: 'recursive delete of a filesystem root or the home directory' },
  { id: 'force-push-protected', why: 'force push to main or master, including --force-with-lease' },
  { id: 'pipe-to-shell', why: 'piping downloaded or base64-decoded payload into a shell or expression evaluator' },
  { id: 'drop-database', why: 'dropping a database or schema from the command line' },
  { id: 'disk-overwrite', why: 'writing directly to a disk device or formatting a filesystem' },
  { id: 'chmod-777-root', why: 'recursive world-writable permissions on the filesystem root' },
  { id: 'fork-bomb', why: 'fork bomb' },
];

const hit = (id) => RULES.find((rule) => rule.id === id);
const shell = /^(?:ba|z|da|k)?sh$/i;
const powershell = /^(?:powershell|pwsh)$/i;
const downloader = /^(?:curl|wget|invoke-webrequest|invoke-restmethod|iwr|irm)$/i;
const evaluator = /^(?:iex|invoke-expression|eval)$/i;
const decoder = /^base64$/i;

const decodeFlag = (arg) => arg === '--decode' || /^-[a-z]*[dD][a-z]*$/.test(arg);
const hasFromBase64 = (group) => group?.words.some((w) => /frombase64string/i.test(w)) ?? false;

const cmdName = (word = '') =>
  word.replaceAll('\\', '/').split('/').at(-1).replace(/\.exe$/i, '').toLowerCase();

// Tokenize arguments while respecting quotes and escapes, without running expansions.
function commands(source, dialect) {
  const bash = dialect === 'bash';
  const ps = dialect === 'powershell';
  const escape = bash ? '\\' : ps ? '`' : '';
  const groups = [];
  const embedded = [];
  let words = [];
  let literals = [];
  let word = '';
  let quote = '';
  let started = false;
  let literalHome = false;
  let parenDepth = 0;
  let closedParen = false;

  const flushWord = () => {
    if (started) {
      words.push(word);
      literals.push(literalHome);
    }
    word = '';
    started = false;
    literalHome = false;
  };

  const flushGroup = (operator = '') => {
    flushWord();
    if (words.length > 0) {
      groups.push({ words, literals, operator, depth: parenDepth });
      closedParen = operator === ')';
    } else if (closedParen && groups.length > 0 && ['|', ';', '&&', '||', ''].includes(operator)) {
      // Preserve a pipe or statement terminator right after closing parens, e.g. "(curl ...) | sh".
      groups.at(-1).operator = operator;
      closedParen = false;
    }
    if (operator === '(') {
      parenDepth++;
      closedParen = false;
    } else if (operator === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      closedParen = true;
    }
    words = [];
    literals = [];
  };

  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];

    if (c === escape && quote !== "'" && (next === '\n' || (next === '\r' && source[i + 2] === '\n'))) {
      i += next === '\r' ? 2 : 1;
      continue;
    }

    if (ps && c === '`' && next && quote !== "'") {
      if (next === '$') {
        literalHome = true;
      }
      word += /[$`"'();|&#\s]/.test(next) ? next : c + next;
      started = true;
      i++;
      continue;
    }

    if (dialect !== 'cmd' && quote !== "'" && ((c === '$' && next === '(') || (bash && c === '`'))) {
      const start = i + (c === '$' ? 2 : 1);
      let level = 1;
      let innerQuote = '';
      let end = start;
      for (; end < source.length; end++) {
        const inner = source[end];
        if (inner === escape && innerQuote !== "'") {
          end++;
          continue;
        }
        if (c === '`') {
          if (inner === '`') {
            break;
          }
          continue;
        }
        if (innerQuote) {
          if (inner === innerQuote) {
            innerQuote = '';
          }
          continue;
        }
        if (inner === '"' || inner === "'") {
          innerQuote = inner;
          continue;
        }
        if (inner === '(') {
          level++;
        }
        if (inner === ')' && --level === 0) {
          break;
        }
      }
      if (end < source.length) {
        embedded.push(source.slice(start, end));
        word += source.slice(i, end + 1);
        started = true;
        i = end;
        continue;
      }
    }

    if (quote) {
      if ((quote === "'" && c === '$') || (bash && c === '~')) {
        literalHome = true;
      }
      if (c === quote) {
        quote = '';
      } else if (bash && quote === '"' && c === '\\' && /["$`\\]/.test(next ?? '')) {
        if (next === '$') {
          literalHome = true;
        }
        word += source[++i];
      } else {
        word += c;
      }
      continue;
    }

    if (c === '"' || c === "'") {
      quote = c;
      started = true;
      continue;
    }

    if (c === '#' && !started) {
      while (i < source.length && source[i] !== '\n') {
        i++;
      }
      flushGroup();
      continue;
    }

    if (bash && c === '\\' && next) {
      if (next === '$' || next === '~') {
        literalHome = true;
      }
      word += next;
      started = true;
      i++;
      continue;
    }

    if (bash && c === '$') {
      const ifs = source.slice(i).match(/^\$\{IFS\}|^\$IFS(?![A-Za-z0-9_])/);
      if (ifs) {
        flushWord();
        i += ifs[0].length - 1;
        continue;
      }
    }

    if (/\s/.test(c)) {
      if (c === '\n') {
        flushGroup();
      } else {
        flushWord();
      }
      continue;
    }

    if (/[;|&()]/.test(c)) {
      const operator = (c === '|' || c === '&') && next === c ? c + source[++i] : c;
      flushGroup(operator);
      continue;
    }

    word += c;
    started = true;
  }

  flushGroup();
  return { groups, embedded };
}

function invocation(words, literals = []) {
  let i = 0;
  while (i < words.length) {
    if (/^[A-Za-z_]\w*=/.test(words[i])) {
      i++;
      continue;
    }
    const cmd = cmdName(words[i]);
    if (!['sudo', 'env', 'command', 'exec', 'nohup', 'builtin'].includes(cmd)) {
      break;
    }
    i++;
    while (i < words.length && words[i].startsWith('-')) {
      const option = words[i++];
      const valued =
        cmd === 'sudo'
          ? ['-u', '-g', '-h', '-p', '-C', '--user', '--group', '--host', '--prompt', '--chdir']
          : cmd === 'env'
            ? ['-u', '--unset', '-C', '--chdir']
            : cmd === 'exec'
              ? ['-a']
              : [];
      if (valued.includes(option)) {
        i++;
      }
    }
  }
  return {
    cmd: cmdName(words[i]),
    rawCmd: words[i] ?? '',
    cmdLiteral: Boolean(literals[i]),
    args: words.slice(i + 1),
    argLiterals: literals.slice(i + 1),
  };
}

function isDecoderGroup(group) {
  if (!group) {
    return false;
  }
  const { cmd, args } = invocation(group.words, group.literals);
  return decoder.test(cmd) && args.some(decodeFlag);
}

function isExecutionTarget(group) {
  if (!group) {
    return false;
  }
  const next = invocation(group.words);
  return shell.test(next.cmd) || powershell.test(next.cmd) || evaluator.test(next.cmd);
}

function isPayloadGroup(group) {
  return (
    Boolean(group) &&
    (downloader.test(invocation(group.words, group.literals).cmd) ||
      isDecoderGroup(group) ||
      hasFromBase64(group))
  );
}

function substPayload(word, dialect) {
  const trimmed = word.trim();
  let inner = null;
  if (trimmed.startsWith('$(') && trimmed.endsWith(')')) {
    inner = trimmed.slice(2, -1);
  } else if (dialect === 'bash' && trimmed.startsWith('`') && trimmed.endsWith('`')) {
    inner = trimmed.slice(1, -1);
  }
  if (!inner) {
    return false;
  }
  return commands(inner, dialect).groups.some(isPayloadGroup);
}

function evalSpanHasPayload(groups, index) {
  if (groups[index].operator !== '(') {
    return false;
  }
  const baseDepth = groups[index].depth;
  for (let j = index + 1; j < groups.length && groups[j].depth > baseDepth; j++) {
    if (isPayloadGroup(groups[j])) {
      return true;
    }
  }
  return false;
}

function pipelineTargetsExecution(groups, index) {
  for (let j = index; j < groups.length; j++) {
    const op = groups[j].operator;
    if (op === '|' && isExecutionTarget(groups[j + 1])) {
      return true;
    }
    if (['', ';', '&&', '||'].includes(op)) {
      break;
    }
  }
  return false;
}

function pipeTarget(groups, index) {
  const group = groups[index];
  if (group.operator === '|') {
    return groups[index + 1] ?? null;
  }
  if (
    group.operator === ')' &&
    groups[index + 1]?.operator === '|' &&
    groups[index + 1].words.length === 1 &&
    /^\.[a-z_]\w*$/i.test(groups[index + 1].words[0])
  ) {
    return groups[index + 2] ?? null;
  }
  return null;
}

function dangerousTarget(target, literalHome = false, windows = false) {
  // Keep trailing separator: "C:\*" hits the drive root, while "C:" is relative.
  const clean = target.replace(/([\\/])\*+$/, '$1');
  if (clean.startsWith('/') && posix.normalize(clean) === '/') {
    return true;
  }
  const windowsPath = win32.normalize(clean);
  if (/^[a-z]:\\$/i.test(windowsPath) || (windows && windowsPath === '\\')) {
    return true;
  }
  if (/^\\\\[^\\]+\\[^\\]+\\?$/.test(clean)) {
    return true;
  }
  const homePattern =
    /^(?:~|\$(?:HOME|USERPROFILE)|\$\{(?:HOME|USERPROFILE)\}|\$env:(?:HOME|USERPROFILE)|\$\{env:(?:HOME|USERPROFILE)\}|%(?:HOME|USERPROFILE)%)(?:[\\/]\.?)*$/i;
  if (!literalHome && homePattern.test(clean)) {
    return true;
  }
  return [process.env.HOME, process.env.USERPROFILE]
    .filter(Boolean)
    .some(
      (home) =>
        win32.normalize(clean).replace(/[\\/]+$/, '').toLowerCase() ===
        win32.normalize(home).replace(/[\\/]+$/, '').toLowerCase(),
    );
}

function forcePush(args) {
  const push = args.indexOf('push');
  if (push < 0) {
    return false;
  }
  const rest = args.slice(push + 1);
  const forced = rest.some(
    (a) => /^(?:--force(?:-with-lease)?(?:=|$)|-[a-z]*f[a-z]*$)/.test(a) || a.startsWith('+'),
  );
  if (!forced) {
    return false;
  }
  if (
    rest.some(
      (a) =>
        ['--all', '--mirror'].includes(a) ||
        /^--force-with-lease=(?:refs\/heads\/)?(?:main|master)(?::|$)/.test(a),
    )
  ) {
    return true;
  }

  const positional = [];
  let remoteOption = false;
  for (let i = 0; i < rest.length; i++) {
    if (['--repo', '--receive-pack', '--exec', '--push-option', '-o'].includes(rest[i])) {
      if (rest[i] === '--repo') {
        remoteOption = true;
      }
      i++;
    } else if (rest[i].startsWith('--repo=')) {
      remoteOption = true;
    } else if (!rest[i].startsWith('-')) {
      positional.push(rest[i]);
    }
  }
  const refs = remoteOption ? positional : positional.slice(1);
  return refs.some((a) => /^(?:\+)?(?:[^:]*:)?(?:refs\/heads\/)?(?:main|master)$/.test(a));
}

function inspect(command, depth, dialect) {
  if (typeof command !== 'string' || depth > 4) {
    return null;
  }
  const windows = dialect !== 'bash';
  const { groups, embedded } = commands(command, dialect);

  for (const source of embedded) {
    const nested = inspect(source, depth + 1, dialect);
    if (nested) {
      return nested;
    }
  }

  if (groups.some((group) => group.words[0] === ':') && /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(command)) {
    return hit('fork-bomb');
  }

  for (let i = 0; i < groups.length; i++) {
    const { cmd, rawCmd, cmdLiteral, args, argLiterals } = invocation(groups[i].words, groups[i].literals);
    const options = args.slice(0, args.includes('--') ? args.indexOf('--') : args.length);
    const recursive = options.some((a) => /^--recursive$|^-[a-z]*r[a-z]*$/i.test(a));
    const psRecursive = args.some((a) => /^-(?:r|re|rec|recu|recur|recurs|recurse)$/i.test(a));
    const cmdRecursive = args.some((a) => /^(?:\/[a-z])+$/i.test(a) && /\/s(?:\/|$)/i.test(a));

    const isRm = cmd === 'rm' && (recursive || (windows && psRecursive));
    const isWinDelete = /^(?:remove-item|ri|del|erase|rd|rmdir)$/.test(cmd) && (psRecursive || cmdRecursive);
    if (
      (isRm || isWinDelete) &&
      args.some((a, index) =>
        dangerousTarget(windows ? a.replace(/^-(?:literalpath|path):/i, '') : a, argLiterals[index], windows),
      )
    ) {
      return hit('rm-root-or-home');
    }

    if (cmd === 'git' && forcePush(args)) {
      return hit('force-push-protected');
    }

    if (downloader.test(cmd) && isExecutionTarget(pipeTarget(groups, i))) {
      return hit('pipe-to-shell');
    }

    if (isDecoderGroup(groups[i]) && isExecutionTarget(pipeTarget(groups, i))) {
      return hit('pipe-to-shell');
    }

    if (windows && hasFromBase64(groups[i]) && pipelineTargetsExecution(groups, i)) {
      return hit('pipe-to-shell');
    }

    if (!cmdLiteral && substPayload(rawCmd, dialect)) {
      return hit('pipe-to-shell');
    }

    const nextGroupCmd = invocation(groups[i + 1]?.words ?? []).cmd;
    if (
      evaluator.test(cmd) &&
      (evalSpanHasPayload(groups, i) ||
        args.some((a, index) => !argLiterals[index] && substPayload(a, dialect)))
    ) {
      return hit('pipe-to-shell');
    }

    if (
      (shell.test(cmd) || powershell.test(cmd)) &&
      groups[i].operator === '(' &&
      groups[i].words.at(-1)?.endsWith('<') &&
      downloader.test(nextGroupCmd)
    ) {
      return hit('pipe-to-shell');
    }

    if (/^(?:psql|mysql|mariadb|sqlite3|sqlcmd|duckdb)$/.test(cmd) && /\bdrop\s+(?:database|schema)\b/i.test(args.join(' '))) {
      return hit('drop-database');
    }

    if (
      /^(?:mkfs(?:\.\w+)?|format-volume|clear-disk)$/.test(cmd) ||
      (cmd === 'format' && args.some((a) => /^[a-z]:$/i.test(a) || dangerousTarget(a))) ||
      (cmd === 'dd' && args.some((a) => /^of=\/dev\/(?:sd[a-z]|nvme\d|hd[a-z]|vd[a-z]|xvd[a-z]|disk\d|mmcblk\d)/.test(a)))
    ) {
      return hit('disk-overwrite');
    }

    if (
      cmd === 'chmod' &&
      recursive &&
      args.some((a) => /^0?777$/.test(a)) &&
      args.some((a) => a.startsWith('/') && dangerousTarget(a))
    ) {
      return hit('chmod-777-root');
    }

    if (shell.test(cmd) || powershell.test(cmd) || cmd === 'cmd') {
      const index = args.findIndex((a) => /^(?:-[a-z]*c|-(?:c|co|com|comm|comma|comman|command)|\/c)$/i.test(a));
      const nestedDialect = cmd === 'cmd' ? 'cmd' : powershell.test(cmd) ? 'powershell' : 'bash';
      if (index >= 0) {
        const nested = inspect(args.slice(index + 1).join(' '), depth + 1, nestedDialect);
        if (nested) {
          return nested;
        }
      }
      if (powershell.test(cmd)) {
        const encoded = args.findIndex((a) =>
          /^-(?:e|en|enc|enco|encod|encode|encoded|encodedc|encodedco|encodedcom|encodedcomm|encodedcomma|encodedcomman|encodedcommand)$/i.test(a),
        );
        if (encoded >= 0 && args[encoded + 1]) {
          const decoded = Buffer.from(args[encoded + 1], 'base64').toString('utf16le');
          const nested = inspect(decoded, depth + 1, 'powershell');
          if (nested) {
            return nested;
          }
        }
      }
    }
  }

  return null;
}

export function check(command, depth = 0, windows = false) {
  return inspect(command, depth, windows ? 'powershell' : 'bash');
}

function main() {
  if (process.env.LLMKIT_GUARD === 'off') {
    process.exit(0);
  }
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    process.exit(0);
  }
  if (!['Bash', 'PowerShell'].includes(input?.tool_name)) {
    process.exit(0);
  }
  const result = check(input?.tool_input?.command, 0, input.tool_name === 'PowerShell');
  if (!result) {
    process.exit(0);
  }
  process.stderr.write(
    `llmkit guard blocked this command (${result.id}): ${result.why}.\n` +
      'If the user explicitly wants this, ask them to confirm and run it themselves, ' +
      'or set LLMKIT_GUARD=off for this session.\n',
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

if (isDirectRun(import.meta.url)) {
  main();
}
