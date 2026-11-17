# Contributing

1. Read [SCOPE.md](SCOPE.md). If the idea is out of scope, open an issue instead of a pull request.
2. Fork, branch, change one thing.
3. Run `npm run check` (Node 20 or newer). It must pass on your machine.
4. In the pull request describe the failure the change prevents and how you tested it.

For skill changes, add or update the [behavior rubric](evals/cases.json) and [scenario](evals/scenarios.md). Exercise realistic tasks in disposable projects and record the observed actions, including failures. Structural checks and scorer fixture tests do not prove agent behavior. For a quality comparison, keep model/client/task/budget constant, include a no-toolkit baseline and repeat trials.

For setup/doctor changes, test dry-run, a fresh install, reinstall, conflicting user content and integrity drift. Never run installer tests against a real user's project. For hooks, include both a blocked case and an ordinary command/write that must remain allowed.

## Style

- Plain, direct English. Short sentences. Imperative steps.
- Every claim about another project needs a source and a date in [docs/gap-analysis.md](docs/gap-analysis.md).
- No secrets, tokens or personal data in any file, including tests and examples.

## Reporting a security problem

If a hook can be bypassed in a way that leaks or deletes data, open a private security advisory on the repository instead of a public issue.
