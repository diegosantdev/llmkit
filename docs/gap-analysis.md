# Architecture and design comparison

Reference notes from reading 13 AI-coding toolkit families (accessed 2026-11-06) alongside the local `llmkit` implementation. This is a design and tradeoff survey, not a cross-product benchmark; star counts and marketing claims are excluded.

## Scope of the survey

- Inspected primary repository READMEs and linked guidance/implementation files (`main` or `next` on the access date; release-pinned notes are marked explicitly).
- Verified upstream locations: `affaan-m/everything-claude-code` redirects to [affaan-m/ECC](https://github.com/affaan-m/ECC), and [get-shit-done](https://github.com/gsd-build/get-shit-done/blob/main/README.md) points to [open-gsd/gsd-core](https://github.com/open-gsd/gsd-core).
- Treated documentation omissions as unestablished rather than missing features, and focused on routing, implementation discipline, review, context weight, installation safety, runtime hooks and testability.

## Surveyed projects

| Toolkit and inspected source | Documented strengths | Tradeoffs and design takeaways |
|---|---|---|
| [obra/superpowers](https://github.com/obra/superpowers/blob/main/README.md), [writing-skills](https://github.com/obra/superpowers/blob/main/skills/writing-skills/SKILL.md) | Design, small plans, worktrees, TDD, independent review, session diagnosis and failure-baseline skill evals. | Prescriptive workflow and mandatory TDD add friction to small cosmetic edits. Keep checks proportional to risk. |
| [github/spec-kit](https://github.com/github/spec-kit/blob/main/README.md) | Specification-to-implementation flow, convergence, templates, extensions and artifact inventory. | Requires Python 3.11+, `uv` and a supported agent; third-party catalog entries are unvetted. Keep setup inspectable with zero external dependencies. |
| [bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD/blob/main/README.md) | Right-sized planning, product/architecture/UX/testing lenses, durable decisions and brownfield adoption. | Separates stable V6.12 from V7 preview alpha on `main`. Label stable vs experimental paths and keep small changes direct. |
| [open-gsd/gsd-core](https://github.com/open-gsd/gsd-core/blob/next/README.md), [installation](https://github.com/open-gsd/gsd-core/blob/next/docs/how-to/install-on-your-runtime.md), [verify and ship](https://github.com/open-gsd/gsd-core/blob/next/docs/how-to/verify-and-ship.md) | Fresh-context subagents, phase execution, onboarding, resumable acceptance checks and stale-verification detection. | Direct file copying skips required runtime transforms, and code review is optional in the shipping flow. Make release review explicit and detect missing setup transforms. |
| [affaan-m/ECC](https://github.com/affaan-m/ECC/blob/main/README.md) | Broad agents/skills/rules catalog, security review, GateGuard, AgentShield, memory, context budgets and migration patterns. | Distinguishes native plugins from capability-limited adapters and warns against duplicate hooks. Breadth needs selective profiles so context stays lean. |
| [mattpocock/skills](https://github.com/mattpocock/skills/blob/main/README.md), [code-review](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md), [scope](https://github.com/mattpocock/skills/blob/main/SCOPE.md) | Composable practices, vertical-slice TDD, domain modeling and scope tied strictly to observed failures. | Review compares committed history against a fixed base. Support uncommitted local diffs cleanly without blocking on extra setup questions. |
| [anthropics/skills](https://github.com/anthropics/skills/blob/main/README.md), [skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md) | Self-contained examples, progressive loading and `skill-creator` baseline comparisons with qualitative review. | Document skills carry distinct licensing terms. Inspect component licenses individually and separate static checks from agent runs. |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills/blob/main/README.md), [web-design-guidelines](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md) | Deep React/Next.js guidance, UI accessibility/UX checks and mobile optimization. | `web-design-guidelines` fetches rules remotely on each run, introducing network and drift dependencies. Keep core instructions local and pinned. |
| [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec/blob/main/README.md), [concepts](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md) | Brownfield change proposals, scenario requirements, spec deltas and parallel changes. | Shared cross-repo stores are beta, and spec artifacts add upkeep on trivial edits. Preserve existing docs and keep a direct path for small fixes. |
| [buildermethods/agent-os](https://github.com/buildermethods/agent-os/blob/main/README.md) | Discovers, indexes and injects existing codebase standards before shaping specs. | Focuses on standards and specifications. Adopt existing repository conventions first rather than layering redundant rules. |
| [trailofbits/skills](https://github.com/trailofbits/skills/blob/main/README.md) | Specialist security workflows: differential review, insecure defaults and false-positive checks. | Specialist marketplace with per-plugin tool prerequisites. Route deep audits externally and demand reproducible evidence for findings. |
| [wshobson/agents](https://github.com/wshobson/agents/blob/main/README.md) | Single Markdown source compiled into runtime adapters, capability matrix and CLI checks. | Permissions, hooks and subagent support vary by host. Document each surface honestly instead of equating copied files with runtime parity. |
| [soumatheusgomes/vibe-coding-toolkit](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/main/README.md) | Machine/project setup, portable prompts, stack preservation, reproducible validation and harness scenarios. | Separates files present, configuration complete and integration tested; does not install push blockers. Adopt that three-tier evidence model. |

**Installer note:** [vercel-labs/skills](https://github.com/vercel-labs/skills/blob/main/README.md) explicitly separates skill discovery from client-specific tool restrictions, hooks and forked execution. Copying `SKILL.md` files never activates runtime hooks on its own.

## Design principles applied in llmkit

- **No invented claims:** rollback, security review, migration checklists, context budgets and brownfield adoption exist across several leading packs. `llmkit` aims for inspectability, proportional ceremony and regression-tested scripts rather than claiming exclusivity.
- **Defense in depth:** `PreToolUse` regex/lexer hooks only protect when the host loads and runs them. They backstop workflows and are not a substitute for sandboxing or permissions.
- **Targeted hardening shipped in 0.2.0:**
  - `secret-scan` inspects every match across examples/templates without exempting lines containing placeholder words, and covers common provider tokens and non-local DB URIs.
  - `guard-bash` handles Bash, native PowerShell (including UTF-16LE `-EncodedCommand` and `iex (irm ...)`), `cmd` flags and shell substitutions, with allowed/blocked regression suites.
  - `checkpoint` snapshots explicit dirty/untracked files outside the repo with SHA-256 verification and safe recovery to a new folder.
  - `setup` / `doctor` provide `--dry-run`, `core`/`full` profiles, `--update`, `--uninstall`, symlink/junction blocking and `.llmkit/install.json` ownership tracking.
  - `start-here` preserves prior authorization and skips spec ceremony for small edits; `untrusted-input` and `parallel-work` cover prompt injection and multi-agent file ownership.

See the [expanded 18-project audit](ecosystem-audit.md) and the [matched workflow results](benchmark-results.md) for concrete upstream bugs and task comparisons.
