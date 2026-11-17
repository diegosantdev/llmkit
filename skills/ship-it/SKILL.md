---
name: ship-it
description: Use when the user asks to release, deploy or publish; prepares evidence and rollback, checks authorization for the concrete target, and verifies the release afterward.
---

# Ship it

Prepare the release completely before any permission question. Existing explicit authorization to publish to a particular target remains valid; do not request it again unless the target, scope or consequences materially change.

## Gates (all must pass or be explicitly waived by the user)

1. `verify-before-done`: build, lint, tests, acceptance criteria.
2. `production-readiness` checked for first releases and major changes.
3. `security-pass` on the release diff when it touches sensitive areas.
4. `license-audit` if dependencies changed or the project is being published.
5. Version bumped and changelog updated. Working tree clean. On the intended branch.
6. Rollback plan written: the exact command or steps to restore the previous version.

## Release

1. Show the user what will happen: target environment, version, commit, and what is irreversible.
2. Check that the user authorized this target and action. If missing, ask after showing the prepared result and gates. A request to review or prepare is not authorization to publish.
3. Take a checkpoint (`checkpoint-rollback`) and a data backup if the release has migrations.
4. Run the release the way the project does it (CI pipeline, platform CLI, `npm publish`, etc.). Prefer CI over local manual releases.

## After release

1. Smoke test the live system: the main user flow and the health endpoint.
2. Watch errors and latency for a short, stated period.
3. Report: version, time, what was verified, link to the release, and the rollback command.
4. If the smoke test fails, use the authorized, verified recovery plan. Do not blindly revert a data migration or overwrite newer data. If safe rollback is unavailable, stop rollout, report the failure and identify the required decision.

## Rules

- Do not publish secrets, `.env` files or build artifacts that were not meant to ship. Check the package contents (`npm pack --dry-run`, or equivalent).
- Do not bypass failing checks to release faster.
