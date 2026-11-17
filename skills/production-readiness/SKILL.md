---
name: production-readiness
description: Use when preparing for the first real users or a major release; checks configuration, errors, logging, backups, limits, monitoring and rollback so failures are visible and survivable.
---

# Production readiness

"Works on my machine" is the start of the checklist, not the end.

## Checklist

1. **Configuration.** All environment-specific values come from environment variables. A `.env.example` lists every variable with a safe placeholder. The app fails fast at startup with a clear message when a required variable is missing.
2. **Secrets.** Not in the repo or the image. Rotated if they ever leaked. Separate values per environment.
3. **Errors.** Unhandled errors are caught at the edge, logged with context, and shown to users as a generic message. Background jobs retry with limits and a dead-letter path.
4. **Logging.** Structured logs, request IDs, no sensitive data. Log level configurable.
5. **Health.** Distinguish liveness (process can respond) from readiness (can serve traffic with required dependencies). Avoid restart loops caused by a shared database outage; match probes and restart behavior to the deployment platform.
6. **Limits.** Request size limits, timeouts on every outbound call, rate limiting on public and expensive endpoints, pagination on lists.
7. **Data.** Automated backups, a tested restore, migrations applied in a controlled step (`db-migration-safety`).
8. **Monitoring.** Error tracking and at least one alert someone will see: error rate, latency, or uptime. Know who gets the page.
9. **Security.** `security-pass` done on the release diff. HTTPS only, security headers, dependency audit clean or accepted.
10. **Performance.** Load tested at the expected peak, or an explicit statement that it was not.
11. **Rollback.** Previous version can be redeployed in minutes. Database changes are backward compatible with it.
12. **Docs.** README has run, test, deploy and rollback commands. Known limitations are listed.

## Report

Mark each item `ok`, `gap` (with the action) or `not applicable` (with the reason). End with a go/no-go recommendation and the top three risks.
