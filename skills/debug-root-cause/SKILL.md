---
name: debug-root-cause
description: Use when something is broken, failing or behaving unexpectedly; finds the root cause with a reproduce-hypothesize-test loop before changing any code.
---

# Debug to the root cause

Do not edit code to "see if it helps". Each edit must test a hypothesis.

## Loop

1. **Reproduce.** Get a command or sequence that fails every time. If it is flaky, find what varies (timing, data, order, environment) before going further.
2. **Shrink.** Remove inputs, files and steps until the smallest failing case remains.
3. **Read the evidence.** The full error, stack trace, logs, recent `git log`/`git diff`. Note what you know and what you assume.
4. **Hypothesize.** Write 2 to 3 candidate causes, most likely first, each with a cheap test that would rule it in or out.
5. **Test one at a time.** Add a log, an assertion or a breakpoint, or bisect (`git bisect`) to find the commit.
6. **Fix the cause, not the symptom.** If the fix is a retry, a try/catch or a sleep, you probably have not found the cause.
7. **Lock it in.** Add a regression test that fails before the fix and passes after.
8. **Look around.** Search for the same pattern elsewhere in the codebase.

## Stop and escalate

If two hypotheses in a row are wrong, or you have changed more than three things, switch to `stuck-loop-breaker`.

## Report

Root cause in one sentence, the evidence, the fix, the regression test, and anything else with the same pattern.
