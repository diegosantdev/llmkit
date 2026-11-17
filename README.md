# llmkit

**Practical workflows and tested guardrails for AI-assisted coding.** 21 focused skills, 2 review agents, local recovery and optional Codex and Claude Code hooks.

Use the direct path for a small edit, a testable plan for a feature, and stronger checks for data changes or releases. Preserve the project's stack and the user's existing work.

## What improves the workflow

- **Local setup:** preview the files, choose 8 core skills or the full set, update only unchanged files recorded by the installer, and cleanly uninstall per target when needed.
- **Proportional process:** no spec ceremony for a typo, no repeated approval for already authorized work.
- **Recovery:** snapshot explicit working files and verify/recover their bytes to a new directory without touching Git.
- **Focused safety:** credential scanning includes examples and comments; command checks cover representative Bash and PowerShell hazards.
- **Evidence:** distinguish automated infrastructure tests, human-reviewed behavior scenarios, and unverified client integration.

The [ecosystem audit of 18 projects](docs/ecosystem-audit.md) and the [architecture comparison](docs/gap-analysis.md) explain the design tradeoffs behind this toolkit.

## Install locally

Node.js 20 or newer. From this toolkit directory, point to an **existing project**:

```text
npm run setup -- --project "../my-app" --target codex --dry-run
npm run setup -- --project "../my-app" --target codex
npm run doctor -- --project "../my-app" --target codex
```

Choose `--target agents`, `codex`, `claude` or `both`; add `--profile core` for 8 skills without review agents or slash commands. `full` remains the default. Add `--json` for structured output. If linked via npm (`npm link` or `npx`), `llmkit-setup` and `llmkit-doctor` invoke the same local entrypoints. No downloads or global settings changes are required by setup.

| Target | Files installed |
|---|---|
| `agents` or `codex` | Skills in `.agents/skills/<name>/` |
| Claude Code | Skills in `.claude/skills/<name>/`, agents in `.claude/agents/`, commands in `.claude/commands/llmkit/` |
| Both | Both layouts |

The preview lists files without writing. For upgrades, preview with `--update --dry-run`, then use `--update` when the plan is correct. Only unmodified managed files recorded in `.llmkit/install.json` can be updated or uninstalled; Markdown files differing only by LF/CRLF line endings still qualify. Pre-existing files are never adopted just because they match. Actual edits, links and unmanaged conflicts abort installation; matching Markdown with different LF/CRLF is left alone. Profile changes do not remove previously installed files. To remove managed files for a target without touching user edits, unmanaged files or other clients, preview with `--uninstall --dry-run` and then run `--uninstall`.

In Codex, request `$start-here` with your task. In Claude Code, use `/llmkit:start <task>` in the full copy layout or `/start-here` in core. `doctor` uses the same target/profile and checks files, not runtime activation. See [compatibility and verification](docs/compatibility.md).

### Codex hooks

The [Codex hooks guide](docs/codex-hooks.md) explains local plugin and project routes, the offline launcher check, and review in the client. Discovery was verified in an isolated Codex CLI profile; trust and end-to-end execution were not granted or tested.

### Claude Code plugin, including hooks

Instead of the copied Claude layout, start Claude Code in your project with the absolute path to this toolkit:

```text
claude --plugin-dir "<absolute-path-to-llmkit>"
```

Then use `/llmkit:start`, `/llmkit:checkpoint` or `/llmkit:ship`. This is the documented [local plugin route](https://code.claude.com/docs/en/plugins/create#load-a-plugin-for-one-session); no GitHub account placeholder is needed. Check `/hooks` and the plugin listing in the host. Avoid loading both the copied Claude layout and the plugin in the same project.

## Skills

| Situation | Skills |
|---|---|
| Start and scope | [start-here](skills/start-here/SKILL.md), [spec-first](skills/spec-first/SKILL.md), [plan-small-steps](skills/plan-small-steps/SKILL.md), [brownfield-adopt](skills/brownfield-adopt/SKILL.md) |
| Implement | [test-first](skills/test-first/SKILL.md), [debug-root-cause](skills/debug-root-cause/SKILL.md), [dependency-reality-check](skills/dependency-reality-check/SKILL.md), [ui-quality-pass](skills/ui-quality-pass/SKILL.md) |
| Protect state and trust | [checkpoint-rollback](skills/checkpoint-rollback/SKILL.md), [db-migration-safety](skills/db-migration-safety/SKILL.md), [untrusted-input](skills/untrusted-input/SKILL.md), [stuck-loop-breaker](skills/stuck-loop-breaker/SKILL.md) |
| Review and release | [verify-before-done](skills/verify-before-done/SKILL.md), [review-diff](skills/review-diff/SKILL.md), [security-pass](skills/security-pass/SKILL.md), [license-audit](skills/license-audit/SKILL.md), [production-readiness](skills/production-readiness/SKILL.md), [ship-it](skills/ship-it/SKILL.md) |
| Coordinate and resume | [parallel-work](skills/parallel-work/SKILL.md), [context-budget](skills/context-budget/SKILL.md), [session-handoff](skills/session-handoff/SKILL.md) |

Review agents: [reviewer](agents/reviewer.md), [security-reviewer](agents/security-reviewer.md). Project templates: [AGENTS.md](templates/AGENTS.md.template), [CLAUDE.md](templates/CLAUDE.md.template), [PRODUCT.md](templates/PRODUCT.md.template), [DECISIONS.md](templates/DECISIONS.md.template), [HANDOFF.md](templates/HANDOFF.md.template). Adapt templates to real project commands; setup does not copy them.

## Hooks and their limits

When the Claude Code host loads this plugin and executes its hooks:

- **guard-bash** checks `Bash` and `PowerShell` calls for representative catastrophic literal commands, including root/home deletion (with `${env:USERPROFILE}`, unquoted Bash `$IFS`/`${IFS}` word splitting and joined `cmd` switches such as `rd /s/q`), protected-branch force pushes and download/decode-to-shell patterns (`|` pipes, `base64 -d | sh`, PowerShell `FromBase64String` into `iex`, `iex (irm ...)` and shell command substitutions). Ordinary local build cleanup stays allowed.
- **secret-scan** checks new `Write`, `Edit` and legacy `MultiEdit` content for recognized credential shapes (provider keys, private key blocks, package/VCS tokens and non-local/non-placeholder DB URIs), including example/template files. Use visibly incomplete placeholders such as `<your_api_key>`. It does not print detected values.

These are heuristics, not a sandbox or complete shell parser. Computed commands, scripts, aliases, unrecognized credentials, other tools and shell-written files can evade them. Malformed input fails open. Session switches `LLMKIT_GUARD=off` and `LLMKIT_SECRET_SCAN=off` disable the corresponding hook. File-copy installation does not activate them.

For the Codex adapter, the host payload is `Bash` or `apply_patch`; the credential check inspects patch additions. Use one runtime-specific route and review hook trust in that client.

## Recover selected files

Use `npm run checkpoint -- --help` (or `llmkit-checkpoint --help` when linked) from this checkout for `create`, `verify` and `recover`. Snapshots cover explicit working file bytes, including untracked files, and recovery writes only to a new directory. The [checkpoint guide](docs/checkpoint.md) has complete examples and limits.

## Verify this toolkit

```text
npm run check
npm run evals -- list
npm run evals -- template --output observations.json
```

`check` validates toolkit structure and tests hooks, setup/update/uninstall/doctor, checkpoint recovery, validation and evaluation tooling. CI is configured for Linux and Windows on Node 20, 22 and 24.

The [24 behavior scenarios](evals/scenarios.md) cover every skill and include controls for small edits, missing capabilities and offline verification. Record observations from real agent sessions and run `npm run evals -- score observations.json` to aggregate them; missing checks cannot pass and stale rubric digests are rejected.

The [matched workflow benchmark](evals/benchmark.md) creates isolated Git fixtures and grades six practical tasks from artifacts. See [the benchmark and guardrail results](docs/benchmark-results.md) and the [verification record](docs/verification.md) for current test coverage and what still requires live client validation.

## Contribute and license

Read [SCOPE.md](SCOPE.md) and [CONTRIBUTING.md](CONTRIBUTING.md). Keep additions focused on observed failures, evidence and selective loading. [MIT](LICENSE).
