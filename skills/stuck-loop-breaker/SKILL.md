---
name: stuck-loop-breaker
description: Use when the same fix has been tried twice, the error keeps changing shape, or work is going in circles; stops the loop, resets assumptions and chooses a different approach.
---

# Break the loop

Symptoms: the same test fails after the third "fix", you are undoing and redoing the same edit, errors move around without shrinking, or you are about to try a fourth variation of an idea that failed three times.

## Steps

1. **Stop editing.** No more attempts until step 4.
2. **Write the state in five lines:**
   - Goal
   - What is actually failing (exact error or behavior)
   - What was tried and what each attempt showed
   - What you are assuming but have not checked
   - What changed in the repo since the last known good state (`git diff --stat`)
3. **Challenge the assumptions.** Check the cheapest one directly: is the right file being run, the right environment, the right version, stale cache, a different process on the port, a wrong working directory?
4. **Pick a different strategy**, not a variation:
   - Revert to the last good state (`checkpoint-rollback`) and redo in smaller steps
   - Build a minimal reproduction outside the project
   - Read the library source or docs for the exact version in use
   - Bisect the history
   - Remove the feature and add it back in halves
5. **Time-box.** Give the new approach a fixed budget (for example 15 minutes or 3 attempts). If it fails, escalate.

## Escalate to the user

Say: what you tried, what you learned, your best theory, and the one thing you need (a credential, a decision, a log, a different scope). Do not keep burning attempts silently.
