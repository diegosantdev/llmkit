---
name: context-budget
description: Use when a session is long, the agent starts forgetting earlier decisions, outputs are huge, or token cost matters; keeps context small, relevant and recoverable.
---

# Context budget

A long context is not a better context. Keep what is needed for the next decision and park the rest in files.

## Habits

1. **Search before reading.** Use grep/glob to find the right file and line range. Read ranges, not whole files, unless the whole file matters.
2. **Cap noisy output without hiding failures.** Save long logs and retain the original command's exit status. Read the error and relevant context; a successful filter command does not mean the build succeeded.
3. **One task per session** when possible. Unrelated work in the same session pollutes both.
4. **Write decisions down** in `DECISIONS.md` or the plan as soon as they are made. Chat history is not storage.
5. **Delegate wide searches** to a subagent that returns only the conclusion, when your tool supports subagents.
6. **Do not paste what is already in a file.** Reference the path.
7. **Prefer small instruction files.** `AGENTS.md` should be a short index with commands and constraints, pointing to details, not an encyclopedia.

## Signals to act on

- You are re-reading files you already read.
- You contradict a decision from earlier in the session.
- A single tool result exceeded a few hundred lines.
- The session has covered 3 or more unrelated tasks.

When context loss affects decisions, update `session-handoff` and re-check the relevant facts. Continue the current authorized work where possible; do not require the user to restart the session merely because a counter was reached.
