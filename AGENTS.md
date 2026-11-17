# AGENTS.md

Instructions for agents working **on this repository** (not the ones the toolkit installs elsewhere).

## Commands

- `npm run check`: validate the toolkit and run all automated tests. Run it before every commit.
- `npm run validate`: skills, agents, commands, manifests, hooks, links.
- `npm test`: hook, installation/doctor, validator and evaluation-scorer tests.
- `npm run setup -- --project <existing-directory> --target agents|codex|claude|both --dry-run`: preview a project-local installation. Use `--profile core` for the small set, `--update --dry-run` for reviewable updates of previously managed bytes.
- `npm run doctor -- --project <existing-directory> --target agents|codex|claude|both`: compare installed files with this checkout, without testing client activation.
- `npm run evals -- list`: list behavior rubrics; scoring requires observations of real agent sessions.
- `npm run benchmark -- prepare <new-disposable-directory>`: create matched comparison fixtures; keep the starting digest. See `evals/benchmark.md` for judging and limits.
- `npm run checkpoint -- --help`: create, verify or recover explicit file snapshots in new directories.
- `npm run hook-check -- --project`: exercise the generated Codex project-hook launcher without activating it.

## Layout

- `skills/<name>/SKILL.md`: one skill per folder, name equals folder name.
- `agents/`, `commands/`: Claude Code agents and slash commands.
- `hooks/hooks.json` and `scripts/hooks/`: safety hooks and their code.
- `templates/`: files users copy into their projects.
- `docs/`, `evals/`: gap analysis and behavior scenarios.

## Rules

- Read `SCOPE.md` before adding a skill. Most ideas belong in "out of scope".
- A skill description starts with "Use when", under 400 characters, and says when to trigger. Bodies stay under 120 lines.
- Every skill must be reachable from `skills/start-here/SKILL.md`.
- Every skill needs a case in `evals/cases.json` and a scenario in `evals/scenarios.md`. Missing observations are not passes; scorer tests are not agent benchmark results.
- Do not put real-looking credentials anywhere, including tests. Build fake ones at runtime.
- Changes to hooks need a test in `scripts/hooks.test.mjs`, including a case that must stay allowed.
- Do not claim coverage or behavior that is not in this repo. Facts about other projects need a source and a date in `docs/gap-analysis.md`.
