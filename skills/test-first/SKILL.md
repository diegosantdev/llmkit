---
name: test-first
description: Use when implementing a feature or fixing a bug where behavior can be checked automatically; writes a failing test first, then the smallest code to pass it, one slice at a time.
---

# Test first

A regression test that failed for the original bug and passes after the fix is stronger evidence than a green test alone. Match testing effort to the behavior and risk.

## Loop (one vertical slice at a time)

1. **Pick one behavior** from the spec's acceptance criteria. Name it in plain words.
2. **Red.** Write one test for it. Run it. Confirm it fails **for the right reason** (the feature is missing, not a typo or a bad import).
3. **Green.** Write the smallest code that makes it pass. Do not add the next feature "while you are here".
4. **Refactor.** With tests green, remove duplication and improve names. Run the tests again.
5. Repeat with the next behavior. Commit only when requested or when the project's established workflow authorizes it; never sweep another person's work into a commit.

## What to test

- Behavior through the public interface, not private functions or implementation details.
- The failure path and the boundary (empty, zero, max, invalid, unauthorized), not only the happy path.
- Bugs: write the reproducing test first (`debug-root-cause` step 7).

## What not to do

- Do not mock the thing under test. Mock only slow or external boundaries (network, clock, payments), and prefer a real local database or fake over a mock when feasible.
- Do not weaken, skip or delete a failing test to get green.
- Do not write all tests first and all code after: one slice at a time keeps feedback fast.
- Do not add tests that merely assert wording, source layout or implementation details. A copy-only edit can use a focused visual/content check. Use a real run for a one-off script, and explain any behavior that remains untested.

## Done when

Changed behavior has appropriate evidence, regression tests distinguish the bug from the fix where feasible, and relevant checks pass (`verify-before-done`). Disclose any acceptance criterion that could not be checked.
