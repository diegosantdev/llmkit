---
name: session-handoff
description: Use when ending a session, switching agents or machines, or when context is exhausted; writes a short handoff file so the next session resumes from facts, not from a summary of a summary.
---

# Session handoff

The next session starts with zero memory. Give it the minimum it needs to continue safely.

## Steps

1. Run `git status` and `git log --oneline -10`. Record the branch and the state of the working tree.
2. Create or update the project's handoff file (`HANDOFF.md` if none exists) with:
   - **Goal** in one sentence
   - **State**: done, in progress, not started (checklist)
   - **Next step**: the exact next action, with the command or file
   - **Decisions** made and why (link `DECISIONS.md` if it exists)
   - **Gotchas**: things that surprised you, flaky tests, env quirks
   - **How to verify**: the commands that prove the current state works
   - **Open questions** for the user
3. Do not include secrets, tokens or personal data. Reference where they live ("in `.env`, not committed").
4. Record uncommitted files and their ownership. Commit to a WIP branch only when authorized; a handoff does not require modifying history or stashing another person's work. Without git, record that limitation and the affected file paths.

## Resuming

The first thing the next session does is read `HANDOFF.md`, then **check it against reality**: current branch, whether files and commits mentioned exist, whether the verify commands still pass. A handoff is a claim, not a fact. Update or correct it if it is stale.

## Rules

- Keep it under about 60 lines. Link instead of copying.
- Facts over narrative: paths, commands, error text. Not "I tried many things".
