---
name: security-pass
description: Use when a change touches authentication, authorization, payments, file uploads, user data, secrets, external input or network calls; runs a focused security review of the diff with evidence.
---

# Security pass

Scope it to the diff and the code paths it connects to. Report only what you can point to.

## Checklist

1. **Secrets.** None in code, config examples, logs, tests or git history of this change. Secrets come from environment or a secret manager. `.env` is git-ignored. If a secret was exposed, say it must be rotated, not just removed.
2. **Input.** Every external input (query, body, header, file, webhook, env, CLI arg) is validated at the boundary with a schema (type, length, range, format).
3. **Injection.** SQL via parameterized queries or the ORM. No string-built shell commands (use argument arrays). No `eval`, `new Function`, or unsafe deserialization of untrusted data. Output encoding for HTML, URLs and logs.
4. **Authentication.** Sessions or tokens have expiry, secure cookie flags (`HttpOnly`, `Secure`, `SameSite`), and rate limiting on login and reset flows. Passwords use a slow hash (argon2, bcrypt, scrypt).
5. **Authorization.** Every route and action checks that **this user** may access **this object** (not just that they are logged in). Look for IDOR: user-supplied IDs used without an ownership check.
6. **Uploads.** Size limit, type check by content not extension, stored outside the web root or on object storage, random file names.
7. **Network.** Outbound requests built from user input are restricted (SSRF). TLS verification is on. CORS is an allowlist, not `*` with credentials.
8. **Dependencies.** New packages pass `dependency-reality-check`; run the ecosystem audit (`npm audit`, `pip-audit`, etc.) and report results.
9. **Errors and logs.** No stack traces to users. No tokens, passwords or full personal data in logs.
10. **Defaults.** Debug mode off, admin routes not exposed, least-privilege database user.

## Report format

For each finding: severity, location (`file:line`), how it can be exploited in one sentence, the fix. Then list what you checked and found clean, and what you could not check.

Do not claim "secure". Say what was reviewed and what remains unreviewed.
