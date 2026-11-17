# Compatibility and evidence

The installer copies files. Doctor checks file integrity. Neither proves that a particular client discovers the files or follows their instructions.

## Capability matrix

| Capability | Codex project copy | Claude project copy | Codex local plugin | Claude local plugin |
|---|---|---|---|---|
| Skills | `.agents/skills/`, core or full | `.claude/skills/`, core or full | Plugin `skills/` | Plugin `skills/` |
| Review agents | Not installed | `.claude/agents/` in full | No adapter | Plugin `agents/` |
| Workflow commands | Invoke skills directly | `.claude/commands/llmkit/` in full | Invoke skills directly | Plugin `commands/` |
| Safety hooks | Separate opt-in project JSON | Not configured | `hooks/codex.json`, separate trust review | `hooks/hooks.json` |
| Evidence | Files tested; project hook discovery tested separately | Files tested | Local install, hook discovery, cached launcher tested | Manifest/script tests |

Claude Code checks `Bash`/`PowerShell` and the new content of `Write`/`Edit`/legacy `MultiEdit`. Codex checks `Bash` and added lines in native `apply_patch` calls. Other clients may use Agent Skills manually; no hook adapter or runtime verification is supplied for them. Writes through shell scripts and other tools are outside the credential scanner's coverage.

## Install behavior

- Run setup from the toolkit directory with an explicit existing `--project`, `--target agents|codex|claude|both`, and optionally `--profile core|full`. `agents` installs portable Agent Skills under `.agents/skills/`; `core` is eight skills only; `full` is the default. Doctor uses the same selection. When linked via npm, `llmkit-setup`, `llmkit-doctor` and `llmkit-checkpoint` expose the same local CLIs.
- `--dry-run` lists each create or eligible update without writing. Files already present and equivalent to this checkout are preserved. An existing matching file is not silently claimed by the installer.
- Explicit `--update` permits replacing previously written files recorded in `.llmkit/install.json` (tolerating LF/CRLF-only line-ending conversions on Markdown). `outdated` means eligible; `conflict` means modified or unmanaged. Any conflict, including redirected destinations, aborts the plan.
- Project settings, existing `AGENTS.md`/`CLAUDE.md`, global directories and hooks are not changed by setup. Templates stay available in this checkout for deliberate adaptation.
- Profiles never remove files on their own. To remove managed files for a selected `--target`, preview with `--uninstall --dry-run` and then run `--uninstall`: only unmodified managed files matching `.llmkit/install.json` (including LF/CRLF-equivalent Markdown) are deleted, user edits or linked paths abort the plan, remaining targets keep their ledger entries, and empty `.llmkit`/target directories are pruned only when clean. Pre-ledger installs have no ownership proof: when a legacy file conflicts, review and reconcile it yourself. A handled write failure triggers a rollback when the newly written bytes are still unchanged; an abrupt interruption can leave a lock to inspect.
- Doctor reports file content and status, not client activation. A Markdown difference limited to LF/CRLF is `equivalent`; setup preserves those bytes. Updates and uninstalls also treat LF/CRLF-only Markdown differences as unmodified against `.llmkit/install.json`, while any real edit or non-Markdown byte change still triggers a conflict.

## Check in the real client

1. Start a fresh session in a disposable project using the intended client/version and record its version.
2. Confirm `start-here` is listed. For copied Claude commands in full, check `/llmkit:start`; for core use `/start-here`. For Codex, invoke `$start-here` directly.
3. Ask for a small reversible edit and observe the relevant check. Then use a selected [behavior scenario](../evals/scenarios.md), recording actual actions and results.
4. Inspect the hook listing. For Codex see [the local plugin and project configuration guide](codex-hooks.md). Validate credential blocking using fake values generated at runtime in a disposable project. Do not test deletion against a real root/home or use live credentials.
5. Record file presence, runtime discovery, hook execution and behavior results separately. Report failures and unavailable capabilities.

Loading copied skills and the plugin together can advertise duplicates. Do not enable both Codex hook routes for the same project. The [verification record](verification.md) separates discovery, offline launcher behavior and untested end-to-end activation.

## Primary format/runtime references

Accessed 2026-11-06:

- [Agent Skills specification](https://agentskills.io/specification): skill layout and metadata. The local 400-character description and 120-line body limits are stricter repository conventions.
- [Claude Code local plugin loading](https://code.claude.com/docs/en/plugins/create#load-a-plugin-for-one-session): `--plugin-dir` loads the plugin for that session.
- [Claude Code skill and command naming](https://code.claude.com/docs/en/skills#how-a-skill-gets-its-command-name): project command subdirectories create colon-qualified names.
- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks): host lifecycle, tool names, input payloads and exit-code behavior, including native PowerShell commands.
- [OpenAI hook reference](https://learn.chatgpt.com/docs/hooks) and [plugin packaging](https://developers.openai.com/plugins/build/plugins) (2026-11-11): native Codex payloads, matchers and trust review.
