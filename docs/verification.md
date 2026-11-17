# Verification

Status of automated checks, launcher verification and client compatibility for `0.2.0`.

## Automated suite

- `npm run check` validates 21 skills, 45 Markdown files, `package.json` scripts/bin targets, manifests, hook definitions and local links, then runs **65 automated tests** on Node 20+.
- **Setup, update and uninstall** (`scripts/installation.test.mjs`): tests `agents`, `codex`, `claude` and `both` targets, `core` and `full` profiles, dry-run previews, LF/CRLF Markdown equivalence in `doctor`/`--update`/`--uninstall` while catching 1-char Markdown edits, conflict refusal, symlink/junction blocking, ownership-bound updates, per-target `--uninstall` with empty-directory cleanup and rollback on mid-operation changes.
- **Checkpoint CLI** (`scripts/checkpoint.test.mjs`): tests exact byte recovery on dirty Git trees (staged edits, unstaged edits, untracked files and binary/CRLF content) without changing `HEAD`, branch or index, plus symlinked bin invocation; negative tests cover symlinks, hardlinks, Windows junctions, 8.3 short-path canonicalization, existing targets, credential-shaped payloads and tampered manifests.
- **Safety hooks** (`scripts/hooks.test.mjs`): tests `Bash` and `PowerShell` literal guards (drive roots, home variables including `${env:USERPROFILE}`, unquoted Bash `$IFS`/`${IFS}` word splitting, joined `cmd` switches such as `rd /s/q`, `git push --force`, `base64 -d | sh`, PowerShell `FromBase64String` into `iex`, `iex (irm ...)`, shell substitutions and Base64 `-EncodedCommand`), `secret-scan` patterns (including non-local DB URIs and example/template files without echoing values), `apply_patch` addition-only inspection and malformed/oversized payloads.
- **Validation and scoring** (`scripts/validate.test.mjs`, `scripts/evaluate.test.mjs`, `scripts/benchmark.test.mjs`): tests frontmatter parsing, `package.json` `bin` target checks, local link/anchor resolution, `suiteDigest` rubric locking, missing-evidence rejection and isolated 6-case Git benchmark fixtures (v3, including multi-file contract updates and pre-existing failing baseline honesty). See [benchmark-results.md](benchmark-results.md) for v2 matched workflow scores and guardrail comparison results.

GitHub Actions is configured in [validate.yml](../.github/workflows/validate.yml) for `ubuntu-latest` and `windows-latest` across Node 20, 22 and 24.

## Codex launcher checks

- `npm run hook-check` and `npm run hook-check -- --project` pass all 4 allow/deny smoke cases through the platform shell (`powershell.exe` on Windows, `/bin/sh` on Unix), and verify SHA-256 script pinning on exported project hooks.
- In Codex CLI `0.167.0-alpha.3.2` on Windows, testing with a disposable profile showed that a root `plugin.json` hid the hook while `.codex-plugin/plugin.json` exposed `Bash|apply_patch` entries in `/hooks` as `untrusted` for both local plugin and project configurations.

## What still requires live client runs

- End-to-end execution of trusted hooks inside live Claude Code (`--plugin-dir`) and Codex sessions across target versions.
- Full human-scored completion of all 24 scenarios in [evals/scenarios.md](../evals/scenarios.md) using `npm run evals -- template`.
- Live database restore and production release drills outside disposable fixtures.
