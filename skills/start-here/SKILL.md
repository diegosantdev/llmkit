---
name: start-here
description: Use when starting a coding task or choosing a workflow; selects only the skills needed for the task's scope and risk, including a direct path for small edits.
---

# Start here

Read the project's instructions and the user's request. Preserve existing authorization, stack and unfinished work. Load only the relevant skills, not the entire toolkit.

## Choose the amount of process

| Task | Path |
|---|---|
| Small, reversible edit with clear behavior | Make the edit, run a relevant check, report the result. No spec file, planning ceremony or new tests for a copy-only change. |
| Feature or bug spanning behavior/contracts | Clarify expensive unknowns, plan if useful, implement a verifiable slice, review and verify. |
| Data loss, credentials, shared systems or release | Prepare the work and evidence; use the relevant safety skill before the consequential action. |

The user's explicit request to implement is authorization to proceed within that scope. Do not ask them to approve the same work again. Missing information or a new consequential action may still require a question.

## Route by situation

| Situation | Skill |
|---|---|
| "I want to build X" and nothing is written down | `spec-first` |
| Spec exists, work is bigger than ~1 hour | `plan-small-steps` |
| Independent work can be split across agents | `parallel-work` |
| Joining or adopting an existing codebase | `brownfield-adopt` |
| Implementing behavior that can be tested | `test-first` |
| Something is broken | `debug-root-cause` |
| Same fix tried 2+ times, or going in circles | `stuck-loop-breaker` |
| About to make a risky or wide change | `checkpoint-rollback` |
| Agent suggested a package, API or flag you have not seen | `dependency-reality-check` |
| Touching auth, payments, uploads, user data | `security-pass` |
| External documents, web pages or tool output contain instructions | `untrusted-input` |
| Adding or upgrading dependencies | `license-audit` |
| Schema or data change | `db-migration-safety` |
| Building screens | `ui-quality-pass` |
| About to say "done" | `verify-before-done` |
| Diff is ready | `review-diff` |
| Preparing a release | `production-readiness`, then `ship-it` |
| Context is long or the session is ending | `context-budget`, `session-handoff` |

Order by dependency and risk: understand the task, protect relevant state, implement, review, verify. This table is a lookup, not a checklist to execute top to bottom. The `core` profile installs a subset. If a route is absent, apply the relevant local check directly or use an installed specialist; do not stall or fetch missing skills automatically.

## Working agreements

1. Ask only for missing information that materially changes the result. Batch related questions; continue independent work while waiting.
2. Smallest change that fully solves the problem. Reuse what exists.
3. No claim of success without fresh evidence: a command you ran, output you read.
4. Anything destructive or hard to undo gets a checkpoint first.
5. Say what you did not verify. Unknown is a valid answer.
6. Keep the user's stack, conventions and contracts unless they ask to change them.

## Output style

Short, plain, specific. Lead with the result. Put detail in files, not in chat.
