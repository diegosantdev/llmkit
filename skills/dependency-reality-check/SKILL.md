---
name: dependency-reality-check
description: Use when the agent proposes or writes code that imports a package, calls an API, uses a CLI flag or a config key you have not confirmed exists; catches hallucinated and typosquatted dependencies before they are installed.
---

# Dependency reality check

LLMs invent plausible package names, function signatures and flags. Attackers register those invented names. Verify before you install or rely on anything new.

## Before adding a package

1. **Does it exist?** Check the registry for the exact name (`npm view <pkg>`, `pip index versions <pkg>`, `cargo search <pkg>`, or the registry page).
2. **Is it the right one?** Compare against the name in the official docs or the project's own README. Look for near-duplicates with a one-character difference.
3. **Is it healthy?** Publish date, last release, weekly downloads, maintainers, linked repo that matches. A package created last week with a famous-sounding name is a red flag.
4. **Is it needed?** Prefer the standard library or something already in the lockfile. Every dependency is attack surface and upkeep.
5. **Install with the lockfile** and review what changed (`git diff package-lock.json`, or the equivalent). Be suspicious of install scripts (`postinstall`).

## Before using an API, flag or config key

- Open the docs for the **installed version** (`node_modules/<pkg>/README`, `--help`, type definitions, source). Do not trust memory.
- Run the smallest possible call and read the result.
- If the signature or option does not exist, say so and find the real one. Do not paper over it with a wrapper.

## Report

List new dependencies with: exact name, version, why it is needed, and how you verified it. Flag anything you could not verify.

## Red flags that stop the install

Unverified identity, a mismatched source/repository, an unexpected install script or permissions unrelated to the task require resolution before execution. Newness or low usage are investigation signals, not proof of malware; popularity is not proof of safety. If offline, inspect installed source and lockfiles and label the registry check unverified rather than inventing a result.
