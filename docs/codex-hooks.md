# Optional Codex hooks

llmkit ships a local `PreToolUse` hook adapter for Codex covering `Bash` and `apply_patch`. It checks literal commands for high-risk patterns and inspects **added** lines in patches for credential-shaped secrets. Patches that remove an existing credential stay allowed, and diagnostics never print matched secret values.

Requires Node.js 20 or newer in the hook execution environment. Choose one of the two routes below; enabling both on the same project runs the hook twice. Skill installation via `setup` does not configure hooks.

## Local plugin

From the llmkit checkout, run `npm run hook-check` to test the packaged launcher locally with synthetic inputs. It does not install or trust the hook. To install in a Codex client that supports local marketplaces:

```text
codex plugin marketplace add "<absolute-path-to-llmkit>"
codex plugin add llmkit@llmkit
```

Start a fresh session and inspect `/hooks` in the CLI or **Settings > Hooks** in the app. Installing a plugin does not grant hook trust: review the command and hook scripts before authorizing execution. Codex requires re-review when packaged files change.

The compatibility manifest `.codex-plugin/plugin.json` points explicitly to `hooks/codex.json`. On Windows under Codex CLI `0.167.0-alpha.3.2`, placing a portable root `plugin.json` hid this hook even though the plugin appeared installed; keeping only `.codex-plugin/plugin.json` allowed installation and `/hooks` discovery in an isolated profile. Behavior in other client versions has not been tested.

## Per-project configuration

```text
npm run hook-check -- --project
node scripts/hook-check.mjs --emit-project-config
```

The second command prints JSON only. Review it and merge the `PreToolUse` entry into the target project's `.codex/hooks.json` without replacing existing hooks. Open `/hooks` to review and trust the entry. The generated command pins the absolute path of this llmkit checkout and verifies the SHA-256 digests of the hook scripts before running them; if you move the checkout or modify scripts, regenerate and review the config.

## Evidence and limits

On Windows under Codex CLI `0.167.0-alpha.3.2`, both the plugin route and project config appeared under `/hooks` as `untrusted` with the expected `^(Bash|apply_patch)$` matcher. Both launchers also passed offline allow/deny checks under real `powershell.exe` with synthetic payloads. Trust approval and end-to-end execution inside a live model turn have not yet been verified.

The command guard inspects literal commands using PowerShell parsing on Windows and Bash parsing elsewhere. Substituted shells, dynamically constructed strings, other tools and shell-written files are outside its coverage. A disabled, untrusted or bypassed hook is not a sandbox guarantee; keep client sandboxing and permission prompts enabled.

References: [OpenAI hooks documentation](https://learn.chatgpt.com/docs/hooks) and [plugin packaging guide](https://developers.openai.com/plugins/build/plugins).
