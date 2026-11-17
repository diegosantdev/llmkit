---
description: Prepare release gates, check authorization for the target, then ship and verify
argument-hint: <target, e.g. staging or production>
---

Use the `ship-it` skill for target: $ARGUMENTS

Prepare all gates and report their results. Perform publish/deploy only when explicitly authorized for this target; honor existing authorization and ask only if it is missing or the scope changed.
