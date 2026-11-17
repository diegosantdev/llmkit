---
name: verify-before-done
description: Use when preparing to report work as done, fixed or working; checks the changed behavior with fresh evidence and discloses unverified parts.
---

# Verify before done

"It should work" is a guess. "I ran X and saw Y" is evidence.

## Checklist

Use the project's required checks and checks relevant to the change. A copy-only edit needs a focused content/render check, not a new test suite. High-risk behavior needs stronger evidence. Skip unavailable checks and say why.

1. **Build / typecheck** passes.
2. **Lint** passes, with no new warnings introduced by your change.
3. **Tests**: relevant behavior tests pass. For a bug fix, demonstrate the regression when feasible. Do not create tests just to satisfy a count.
4. **Behavior**: exercise the actual feature (run the app, call the endpoint, click the flow). Check the happy path and one failure path.
5. **Acceptance criteria** from the spec: tick each one against what you observed.
6. **Diff review**: read the actual staged/working/branch diff appropriate to this task for debug code, stray files and unrelated changes. In an extracted archive without git, compare the files you changed and disclose that history was unavailable.

## Reporting

State, in this shape:

- Verified: what you ran and the result
- Not verified: what you could not run and why (no credentials, no network, no test exists)
- Known risks or follow-ups

## Rules

- Output from before your last edit does not count. Re-run after the final change.
- Do not weaken a test, delete an assertion or add `skip` to get green. Fix the cause or report the failure.
- Pre-existing failures: use a recorded baseline or an isolated comparison. Never reset a dirty working tree to prove a baseline. If you cannot establish it, call the failure unattributed.
- Retain command exit status and enough output to explain failures. An empty filtered log is not proof of success.
- If you cannot verify something, say so plainly. Never imply you did.
