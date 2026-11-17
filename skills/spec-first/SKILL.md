---
name: spec-first
description: Use when a substantial build request has expensive unknowns or lacks acceptance criteria; turns it into a concise, testable scope while preserving authorization to implement.
---

# Spec first

Code written against a vague idea is rewritten. Spend five minutes making the idea testable.

## Steps

1. **Restate** the goal in one sentence: who, what, why.
2. **Find the gaps.** Inspect existing requirements and code first. Ask only about unknowns that change the design; suggest defaults. State reasonable assumptions for reversible choices and continue independent work.
3. **Write a short spec** in the existing requirements document, or `PRODUCT.md` if useful, with:
   - Problem and audience
   - MVP scope: the smallest thing that is useful
   - Explicitly out of scope
   - Acceptance criteria as observable checks ("given X, when Y, then Z")
   - Assumptions you made
4. **Proceed within authorization.** If the user asked to build, summarize the scope and implement. Wait only for an answer that materially affects correctness, or for approval of an action not already authorized. If they asked only for a spec, deliver the spec.

## Rules

- Acceptance criteria must be checkable by running something or clicking something. "Fast" and "nice" are not criteria; "list loads in under 1s with 1,000 rows" is.
- Separate must-have from nice-to-have. Cut the second group first.
- Record decisions that were hard to make in `DECISIONS.md` with the reason.
- If the request is small (one function, one bug, one copy change), skip the file and state the criterion in one line.

## Done when

The intended scope and assumptions are clear, every criterion is observable, and any required question has been answered before dependent work proceeds.
