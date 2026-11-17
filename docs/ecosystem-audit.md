# Ecosystem audit of AI-coding toolkits

**Reference date: 2026-11-11 (updated for 0.2.0 hardening).** Technical comparison of 18 projects across five areas: engineering discipline, specification workflows, catalog/installers, runtime orchestration and specialist security/frontend skills.

## Reading criteria

- **Fixed:** confirmed by the upstream maintainer and resolved in a release or merged PR.
- **Reported:** open issue with a concrete failure case at the time of inspection.
- **Limit:** documented architectural, platform or scope boundary.
- Release and commit links pin the inspected version; links to `main` or `next` reflect documentation on the reference date.
- Based on inspecting source code, documentation, issues and official releases (without executing third-party installers; earlier survey notes remain in [gap-analysis.md](gap-analysis.md)).

## Six core technical references

### 1. gstack: product, implementation and browser workflows

**Snapshot:** [v1.99.0.0](https://github.com/garrytan/gstack/releases/tag/v1.99.0.0) (`9ab5034`). Its [host documentation](https://github.com/garrytan/gstack/blob/main/docs/hosts.md) specifies SHA-256 file manifests: colliding unmanaged files abort setup, while uninstall skips symlinks and preserves user edits.

**Documented limit:** unsigned local binaries can be blocked by Windows 11 Smart App Control ([issue #2595](https://github.com/garrytan/gstack/issues/2595), kept diagnostic). **Applied design:** track ownership per destination, distinguish modified managed files from unmanaged files and report platform scope honestly in `doctor`.

### 2. cc-sdd: multi-client specification workflows

**Snapshot:** [v3.1.0](https://github.com/gotalab/cc-sdd/releases/tag/v3.1.0) (`240740031f`). End-to-end spec and phased review pipeline with partial resume.

**Fixed in [v3.0.1](https://github.com/gotalab/cc-sdd/releases/tag/v3.0.1):** path traversal and symlink hardening. **Documented limit:** the [compatibility matrix](https://github.com/gotalab/cc-sdd/blob/main/docs/guides/agent-compatibility.md) warns of collisions when multiple clients share `.agents/skills`. **Applied design:** block symlink/junction ancestors and isolate conflict checks per target.

### 3. Ruflo (formerly Claude Flow): runtime orchestration and memory

**Snapshot:** [v3.75.3](https://github.com/ruvnet/ruflo/releases/tag/v3.75.3) (`8421e87322`). Large runtime platform with multi-agent coordination and persistent memory.

**Fixed:** in [#2721](https://github.com/ruvnet/ruflo/issues/2721), plugin hooks under native Windows Codex invoked `/bin/bash` and broke on shell quoting; the fix moved to a Node bootstrap and guarded `.claude` against symlinks. **Applied design:** exercise the exact hook command through the native platform shell (including spaces and special characters in checkout paths) and validate destination trees before writing.

### 4. harness-kit: repository-derived context

**Snapshot:** [deepklarity/harness-kit](https://github.com/deepklarity/harness-kit/blob/main/README.md). Generates project-tailored instructions, workflow guides and inspection scripts while preserving local edits on upgrade.

**Documented limit:** targets Claude Code on Node 22+ and Windows via WSL. **Applied design:** base evaluations on verifiable artifacts and preserve a direct low-ceremony path for small edits.

### 5. wshobson/agents: generated multi-client catalog

**Snapshot:** [README](https://github.com/wshobson/agents/blob/main/README.md) and [harness matrix](https://github.com/wshobson/agents/blob/main/docs/harnesses.md). Single Markdown source compiled into per-client adapters with [CI](https://github.com/wshobson/agents/blob/main/.github/workflows/validate.yml) checks for drift and live CLI validation.

**Documented limit:** granular permissions map to `sandbox_mode` in the Codex adapter, and local checkouts can duplicate discovery alongside user plugins. **Applied design:** separate declared compatibility, file integrity and live client discovery, and warn against double-loading copied layouts with plugins.

### 6. Vercel Skills CLI: content provenance and lockfiles

**Snapshot:** [v1.8.1](https://github.com/vercel-labs/skills/releases/tag/v1.8.1) (`e781cb4`). Content-hashed lockfile with `--frozen-lockfile`.

**Fixed / reported:** [#1199](https://github.com/vercel-labs/skills/issues/1199) / [#2607](https://github.com/vercel-labs/skills/pull/2607) fixed symlink replacement over copied files on update; [#1718](https://github.com/vercel-labs/skills/issues/1718) reports add/remove/update resetting per-client selections. **Applied design:** record ownership by exact destination path and scope install, `--update` and `--uninstall` per target.

## Other inspected references

| Project and scope | Main strength | Practical takeaway |
|---|---|---|
| [Superpowers v7.0.2](https://github.com/obra/superpowers/releases/tag/v7.0.2) (`22f0b463`) | Design, worktrees, TDD, independent review and [baseline skill evals](https://github.com/obra/superpowers/blob/v7.0.2/skills/writing-skills/SKILL.md). | Bind checkpoints to the source project and verify integrity before restoring. |
| [GitHub Spec Kit v1.4.0](https://github.com/github/spec-kit/releases/tag/v1.4.0) | [Templates, presets and inventory](https://github.com/github/spec-kit/blob/v1.4.0/README.md) for durable specs. | Treat free-form CLI inputs with leading hyphens, spaces and symbols as literal text. |
| [BMad Method v6.12.4](https://github.com/bmad-code-org/BMAD-METHOD/releases/tag/v6.12.4) | Scale-aware flows and product/architecture lenses. | Keep profile and channel selectors aligned strictly with supported combinations. |
| [Open GSD v1.20.1](https://github.com/open-gsd/gsd-core/releases/tag/v1.20.1) | Isolated phases and [stale-verification detection](https://github.com/open-gsd/gsd-core/blob/next/docs/how-to/verify-and-ship.md). | Refuse cache writes when configuration directories are redirected via links. |
| [ECC v2.2.3](https://github.com/affaan-m/ECC/releases/tag/v2.2.3) (`c05b2d66`) | Broad catalog, AgentShield, memory and [adaptation guide](https://github.com/affaan-m/ECC/blob/v2.2.3/docs/MANUAL-ADAPTATION-GUIDE.md). | Avoid automatic stashing or committing for checkpoints when staged edits and untracked files exist. |
| [Matt Pocock Skills v1.3.2](https://github.com/mattpocock/skills/releases/tag/v1.3.2) | Composable skills and [two-axis code review](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md). | Verify benchmark regression tests genuinely fail against unpatched code with an assertion error. |
| [Anthropic Skills](https://github.com/anthropics/skills/blob/main/README.md) | Progressive loading and [skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md). | Check per-component licenses and keep behavioral scoring separate from structural checks. |
| [Vercel Agent Skills](https://github.com/vercel-labs/agent-skills/blob/main/README.md) | React/Next.js depth and [web-design-guidelines](https://github.com/vercel-labs/agent-skills/blob/main/skills/web-design-guidelines/SKILL.md). | Remote instructions drift across runs; keep core rules local and versioned. |
| [OpenSpec v1.17.0](https://github.com/Fission-AI/OpenSpec/releases/tag/v1.17.0) | [Specs and deltas](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md) for brownfield codebases; preserves edits on update. | Test path handling on native Windows without assuming optional environment variables. |
| [Agent OS](https://github.com/buildermethods/agent-os/blob/main/README.md) | Indexes existing conventions before proposing changes. | Adopt local repository conventions before layering new rules. |
| [Trail of Bits Skills](https://github.com/trailofbits/skills/blob/main/README.md) | Security audits, differential review and false-positive filtering. | Route deep audits to specialists and require reproducible proof per finding. |
| [soumatheusgomes's skills toolkit](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/main/README.md) | Reproducible setup, [validation](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/main/docs/05-toolkit-validation.md) and [harness scenarios](https://github.com/soumatheusgomes/vibe-coding-toolkit/blob/main/docs/07-harness-evaluation.md). | Separate file presence, configuration readiness and live client activation. |

## Delivery priorities in 0.2.0

| Area | Engineering choice | Verified coverage |
|---|---|---|
| **Install, update and uninstall** | `core`/`full` profiles, `agents`/`codex`/`claude`/`both` targets, per-path ledger in `.llmkit/install.json`, conflict/symlink/junction refusal and `--uninstall` scoped per target. | Covered in [installation.test.mjs](../scripts/installation.test.mjs), including Windows 8.3 short paths, LF/CRLF tolerance on Markdown, rollback on mid-run conflicts and empty-directory pruning. |
| **File-level checkpoint** | Out-of-repo snapshots with per-file and manifest SHA-256 digests, link/credential refusal and recovery only into a new directory. | Covered in [checkpoint.test.mjs](../scripts/checkpoint.test.mjs) with staged/unstaged/untracked dirty trees, binary/CRLF payloads and symlinked bin execution. |
| **Claude and Codex hooks** | Bash/PowerShell/cmd command guard (including `$IFS` splitting and Base64 decode-to-shell pipes), `secret-scan` without exempting examples, Codex `apply_patch` addition-only inspection and SHA-256-pinned project hooks. | Covered in [hooks.test.mjs](../scripts/hooks.test.mjs) and [hook-check.mjs](../scripts/hook-check.mjs); live session enforcement requires user trust approval in the client. |
| **Reproducible evaluation** | [Isolated Git benchmark](../evals/benchmark.md) and digest-locked rubric scoring in [evaluate.mjs](../scripts/evaluate.mjs). | Recorded outcomes in [benchmark-results.md](benchmark-results.md). |

Reporting levels used across documentation:

1. **Valid files:** structure, frontmatter, links and manifests pass local validation.
2. **Verified installation:** installed files match checkout digests and target scope.
3. **Verified client discovery:** hook/skill discovery observed in the recorded client version.
4. **Observed behavior:** task execution scored from artifacts and controlled rubrics.
