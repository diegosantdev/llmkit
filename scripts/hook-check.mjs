#!/usr/bin/env node
// Offline smoke test for the Codex hook launchers. Does not install or trust any hook.
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hookPath = './hooks/codex.json';
const entry = 'scripts/hooks/codex-pre-tool.mjs';
const hookFiles = ['codex-pre-tool.mjs', 'guard-bash.mjs', 'secret-scan.mjs'];
const matcher = '^(Bash|apply_patch)$';

// PLUGIN_ROOT is read inside Node so shell quoting and spaces never corrupt the path.
const command =
  `node --input-type=commonjs -e "const p=require('node:path'),u=require('node:url');` +
  `import(u.pathToFileURL(p.join(process.env.PLUGIN_ROOT,'${entry}')).href).then(m=>m.run())"`;

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function inspectCodexHooks(directory = root) {
  const base = realpathSync.native(directory);

  function local(path) {
    const file = join(base, path);
    const part = relative(base, realpathSync.native(file));
    ensure(
      part && !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`) && lstatSync(file).isFile(),
      `Expected a regular local file: ${path}`,
    );
    return file;
  }

  const readJson = (path) => JSON.parse(readFileSync(local(path), 'utf8'));
  const pkg = readJson('package.json');
  const plugin = readJson('.codex-plugin/plugin.json');

  // Keep only the compatibility manifest: a root plugin.json shadows it in Codex 0.167.0-alpha.3.2.
  ensure(
    !existsSync(join(base, 'plugin.json')),
    'A portable root manifest would shadow the tested Codex compatibility manifest',
  );
  ensure(
    plugin.name === pkg.name && plugin.version === pkg.version,
    'Codex manifest identity differs from package.json',
  );
  ensure(plugin.skills === './skills/', 'Codex manifest must explicitly reference ./skills/');
  ensure(plugin.hooks === hookPath, 'Codex manifest must explicitly reference hooks/codex.json');

  const config = readJson(hookPath).hooks;
  const group = config?.PreToolUse?.[0];
  const handler = group?.hooks?.[0];
  ensure(
    config &&
      Object.keys(config).length === 1 &&
      config.PreToolUse?.length === 1 &&
      group?.matcher === matcher &&
      group.hooks?.length === 1,
    'Codex hook must match Bash and apply_patch on PreToolUse',
  );
  ensure(
    handler?.type === 'command' &&
      handler.command === command &&
      handler.async !== true &&
      Number.isInteger(handler.timeout) &&
      handler.timeout > 0 &&
      handler.timeout <= 30,
    'Codex launcher differs from the reviewed synchronous command',
  );

  for (const file of hookFiles) {
    local(`scripts/hooks/${file}`);
  }
  return { directory: base, command: handler.command, matcher: group.matcher };
}

export function projectHookConfig(directory = root) {
  const { directory: base } = inspectCodexHooks(directory);
  const hooksDir = join(base, 'scripts', 'hooks');
  const encoded = Buffer.from(hooksDir).toString('base64');
  const digest = createHash('sha256');
  for (const name of hookFiles) {
    const bytes = readFileSync(join(hooksDir, name));
    digest.update(`${name}:${bytes.length}:`).update(bytes);
  }
  const names = hookFiles.map((name) => `'${name}'`).join(',');

  // Pin script bytes by SHA-256 so unreviewed checkout changes fail closed.
  const body =
    `const p=require('node:path'),u=require('node:url'),f=require('node:fs'),` +
    `h=require('node:crypto').createHash('sha256'),d=Buffer.from('${encoded}','base64').toString('utf8');` +
    `for(const n of [${names}]){const b=f.readFileSync(p.join(d,n));h.update(n+':'+b.length+':').update(b)}` +
    `if(h.digest('hex')!=='${digest.digest('hex')}'){console.error('llmkit hook scripts changed; regenerate and review the project hook.');process.exit(1)}` +
    `import(u.pathToFileURL(p.join(d,'${hookFiles[0]}')).href).then(m=>m.run())`;

  return {
    description: `llmkit project hook pinned to this checkout: ${hooksDir}`,
    hooks: {
      PreToolUse: [
        {
          matcher,
          hooks: [
            {
              type: 'command',
              command: `node --input-type=commonjs -e "${body}"`,
              timeout: 10,
              statusMessage: 'Checking llmkit guardrails',
            },
          ],
        },
      ],
    },
  };
}

export function checkLauncher(directory = root, source = 'plugin') {
  const config = inspectCodexHooks(directory);
  ensure(['plugin', 'project'].includes(source), 'Unknown launcher source');
  const launch =
    source === 'project'
      ? projectHookConfig(directory).hooks.PreToolUse[0].hooks[0].command
      : config.command;
  const windows = process.platform === 'win32';
  const shell = windows ? 'powershell.exe' : '/bin/sh';
  const args = windows ? ['-NoProfile', '-NonInteractive', '-Command', launch] : ['-c', launch];
  const key = 'gh' + 'p_' + 'A'.repeat(36);
  const patch = (line) => `*** Begin Patch\n*** Add File: settings.txt\n+${line}\n*** End Patch`;

  const cases = [
    ['shell-read', 'Bash', windows ? 'Get-ChildItem -Name' : 'ls -la', false],
    ['shell-root', 'Bash', windows ? 'Remove-Item -Recurse C:\\*' : 'rm -rf /', true],
    ['patch-placeholder', 'apply_patch', patch('KEY=<your_key>'), false],
    ['patch-credential', 'apply_patch', patch(`KEY=${key}`), true],
  ];

  const checks = cases.map(([id, tool, input, denied]) => {
    const result = spawnSync(shell, args, {
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true,
      env: { ...process.env, PLUGIN_ROOT: config.directory, LLMKIT_GUARD: 'on', LLMKIT_SECRET_SCAN: 'on' },
      input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { command: input } }),
    });
    let decision;
    try {
      decision = JSON.parse(result.stdout ?? '').hookSpecificOutput;
    } catch {
      // Empty stdout is expected when allowed.
    }
    const expected = denied
      ? decision?.permissionDecision === 'deny' && decision.hookEventName === 'PreToolUse'
      : result.stdout?.trim() === '';
    const leaked = `${result.stdout ?? ''}${result.stderr ?? ''}`.includes(key);
    return { id, expected: denied ? 'deny' : 'allow', passed: result.status === 0 && expected && !leaked };
  });

  return {
    ok: checks.every(({ passed }) => passed),
    runtime: 'codex',
    source,
    manifest: 'verified',
    launcherShell: shell,
    liveActivation: 'not-tested',
    checks,
  };
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
    const args = process.argv.slice(2);
    const emit = args.length === 1 && args[0] === '--emit-project-config';
    ensure(
      emit || (new Set(args).size === args.length && args.every((arg) => ['--json', '--project'].includes(arg))),
      'Usage: hook-check.mjs [--project] [--json] | --emit-project-config',
    );
    if (emit) {
      console.log(JSON.stringify(projectHookConfig(), null, 2));
    } else {
      const result = checkLauncher(root, args.includes('--project') ? 'project' : 'plugin');
      if (args.includes('--json')) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Codex ${result.source} hook launcher: ${result.ok ? 'ok' : 'failed'} (${result.launcherShell})`);
        for (const check of result.checks) {
          console.log(` - ${check.id}: ${check.passed ? 'pass' : 'fail'} (${check.expected})`);
        }
        console.log('Live activation was not tested. Review the enabled hook in the client.');
      }
      process.exitCode = result.ok ? 0 : 1;
    }
  } catch (error) {
    console.error(`hook-check: ${error.message}`);
    process.exitCode = 2;
  }
}
