---
name: brownfield-adopt
description: Use when starting work on an existing codebase you did not write or have not seen; maps the project, finds the real commands and conventions, and adds agent instructions without changing the stack.
---

# Brownfield adopt

Learn the project as it is. Do not impose a new stack, structure or style.

## Steps

1. **Map.** Read the README, manifest files (`package.json`, `pyproject.toml`, `go.mod`, ...), lockfile, CI config, and top-level layout. Identify language, framework, package manager, test runner, linter, and how it is deployed.
2. **Find the real commands.** Run install, build, test and lint exactly as CI does. Record which pass, which fail and which already failed before you touched anything (baseline).
3. **Find conventions.** Naming, folder layout, error handling, how data is accessed, how tests are written. Read three representative files per area and match them.
4. **Find the sharp edges.** Generated files, migrations, vendored code, feature flags, code owners, anything marked "do not edit".
5. **Write or update `AGENTS.md`** with observed commands, conventions and the do-not-touch list. A bundled template may help if available; never depend on an absent checkout resource. Preserve existing instructions and add only what is missing. Create a `CLAUDE.md` that points to it if the client needs one.
6. **Pick one small win** (a failing test, a lint fix, a documented script) to prove the loop works before bigger changes.

## Rules

- Preserve the existing stack, formatter, and patterns. Propose migrations separately and wait for a decision.
- Do not reformat or reorganize files you are not changing: it hides the real diff.
- Record the baseline so later failures are attributed correctly.
- Avoid adding new dependencies or tools unless the task needs them.

## Done when

You can say how to run, test and lint the project; where the main flows live; what not to touch; and the baseline state, and `AGENTS.md` reflects it.
