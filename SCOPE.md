# Scope

llmkit stays small on purpose. Big catalogs are hard to trust, hard to test and expensive in context.

## In scope

A skill belongs here when **all** are true:

1. It targets a failure that AI-assisted projects hit often (data loss, leaked secrets, invented dependencies, unreviewed releases, going in circles).
2. It is stack-agnostic, or clearly marked and optional.
3. It produces evidence a person can check (a command output, a report with locations, a file).
4. It fits in about 100 lines and has a scenario in `evals/scenarios.md`.

## Out of scope

- Framework or vendor tutorials (use the vendor's own skills).
- Persona or style skills ("talk like a pirate").
- Anything that publishes, pays or deletes without explicit authorization for the action and target. Honor authorization already given; ask only if missing or materially changed.
- Wrappers around a single CLI that the CLI's own docs already cover.
- Telemetry of any kind.

## Overlap policy

Where good skills already exist (for example broad planning or subagent orchestration), llmkit does not copy them. It routes to the best available skill and fills the gap around it. Install both.

## Adding a skill

1. Open an issue with the failure it prevents and a concrete scenario.
2. Add `skills/<name>/SKILL.md`, a row in `skills/start-here/SKILL.md`, a rubric in `evals/cases.json`, and a scenario in `evals/scenarios.md`. Include a realistic non-trigger/control case where misrouting is likely.
3. `npm run check` must pass.
