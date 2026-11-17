---
name: checkpoint-rollback
description: Use when preparing risky or wide changes, or undoing a failed change; protects committed and uncommitted work and identifies a scoped recovery path before destructive actions.
---

# Checkpoint and rollback

AI-assisted coding moves fast; the safety net lets you keep moving without losing work. Always know how to get back.

## Before the risky change

1. Read `git status --short`, the current branch/commit, and relevant diffs. Separate existing work from this task. Do not overwrite, stage, stash or commit someone else's work by default.
2. **Protect dirty content.** A branch or tag points to a commit; it does not save uncommitted or untracked files. Use a separate worktree for isolated work, or a private backup of the exact affected files (including untracked ones). Record its location and restore procedure. Keep secrets out of commits and chat.
3. For clean committed state, record the commit and optionally create a uniquely named branch/tag without replacing an existing ref. Commit/stash only when authorized and after reviewing exactly what it includes.
4. For state outside git (database, uploads, ignored config), use an access-controlled snapshot or backup and verify restoration. Do not duplicate secrets unnecessarily. If a safe restore point cannot be made, continue independent work and ask before the risky step.
5. State what the checkpoint covers, what it excludes, and the recovery steps. A git ref alone cannot restore a database or a dirty tree.

## If the llmkit checkout is available

Its `checkpoint create` command accepts only named project-relative files and writes a snapshot outside the project. Run its `verify` operation before editing. Record the snapshot path and digest before the first change. `recover` reconstructs the saved bytes in a new directory; compare them before deciding what to restore to the project.

The command does not save a separate version from the index or change Git history. Keep the index intact and inspect it separately when staged and unstaged edits coexist. A copy-only skill installation does not install this command; use a verified private copy if the checkout is unavailable.

## While working

- Keep verifiable slices; create commits only within the authorized workflow.
- Never use `git push --force` to a shared branch. Use `--force-with-lease` on your own branch only.

## Rolling back

Prefer the least destructive option that works:

| Goal | Command |
|---|---|
| Undo a commit, keep history | `git revert <sha>` |
| Restore affected dirty content | Recover the exact files from the recorded backup, after checking for newer edits |
| Discard a specific uncommitted file change | `git restore -- <file>` only after reviewing and authorizing that loss |
| Abandon an isolated experiment | Return to the recorded original branch/worktree; keep the experiment until its contents are reviewed |

`git reset --hard` and `git clean -fd` destroy uncommitted work. Show the user what will be lost (`git status`, `git diff --stat`) and get a yes first.

## Done when

Recovery steps cover the actual affected state, and their prerequisites were checked. Label untested recovery steps as untested; do not execute a destructive rollback just to demonstrate it.
