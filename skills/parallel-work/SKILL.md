---
name: parallel-work
description: Use when independent research, implementation or review tasks can run concurrently with available subagents; assigns ownership and integrates evidence without conflicting edits.
---

# Parallel work

Delegate only work that can progress independently. If subagents are unavailable or the task is small, work directly; do not simulate agents by announcing roles.

## Split by responsibility

1. Inspect the task and shared interfaces first. Keep tightly coupled changes together. Parallelize independent reads and research before splitting edits to the same module.
2. Give each worker a bounded outcome, relevant paths, constraints, verification criteria and explicit file ownership. Tell it about existing user changes. One worker owns each writable file; others send findings.
3. State which decisions depend on another result. Keep those steps sequential. Do useful independent work while workers run.
4. Share interface changes promptly. If two workers need the same file, reassign ownership or sequence the edits before either writes.

## Integrate

Read each worker's actual artifacts and evidence. A worker's success message is a claim to verify. Check interactions between pieces, run the relevant combined checks after integration, and resolve conflicts without discarding another worker's or user's changes.

For an independent review, give the reviewer the task and raw artifacts, without the desired conclusion. Ask for concrete findings and verification; do not ask it to confirm your answer.

## Report

State the integrated result, relevant checks, unresolved dependencies and any work that remains unverified. Do not multiply the same check or claim independent evidence from workers that copied one another's conclusions.
