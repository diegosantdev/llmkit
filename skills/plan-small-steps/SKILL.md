---
name: plan-small-steps
description: Use when a spec exists and the work spans more than a few files or about an hour; breaks it into small, independently verifiable steps ordered by risk.
---

# Plan in small steps

## Steps

1. Read the spec and the code it touches. Do not plan from memory.
2. Identify the **riskiest unknown** (new API, data migration, unfamiliar library). Put a thin end-to-end slice that exercises it first.
3. Split the rest into steps of roughly 5 to 30 minutes. Each step must have:
   - Goal in one line
   - Files it will touch
   - How to verify it (command or visible behavior)
   - What it depends on
4. Order: riskiest slice, then the rest vertically (one working feature at a time), never "all models, then all routes, then all UI".
5. Mark checkpoints (`checkpoint-rollback`) before steps that are wide or irreversible.
6. Write the plan to `PLAN.md` only if it will outlive this session. Otherwise keep it in the task list.

## Rules

- A step that cannot be verified is two steps or a research task.
- Each step leaves the project in a working state: build passes, tests pass.
- Do not plan features that are not in the spec. Add them to a "later" list.
- Re-plan when reality disagrees. A wrong plan followed faithfully is worse than no plan.

## Done when

Another agent could execute the plan without asking you anything, and each step has a verification you can run.
