---
name: license-audit
description: Use when adding or upgrading dependencies, copying code or assets, or preparing to publish or sell a project; checks that licenses are compatible with how the project will be used and distributed.
---

# License audit

This is a technical inventory, not legal advice. Flag risks and send hard cases to a lawyer.

## Steps

1. **Decide the target.** How will the project be used: internal tool, SaaS, distributed binary, open source library, closed-source product? And under which license will you publish it, if any?
2. **Inventory.** List direct and transitive dependencies with their licenses. Use the ecosystem tool when available (`npx license-checker --summary`, `pip-licenses`, `cargo license`, `go-licenses`) and read the lockfile.
3. **Classify** each license:
   - Permissive (MIT, BSD, Apache-2.0, ISC): generally fine, keep notices.
   - Weak copyleft (LGPL, MPL): fine with care on linking and file-level changes.
   - Strong copyleft (GPL, AGPL): may impose source obligations on your project; AGPL reaches network use.
   - Source-available or custom (BUSL, SSPL, Elastic, "non-commercial"): check usage limits.
   - Missing or unclear: treat as all rights reserved until resolved.
4. **Check compatibility** against the target in step 1 and against your own license.
5. **Copied code and assets.** Fonts, icons, images, templates, snippets from forums and AI output have licenses or terms too. Record the source.
6. **Notices.** Add a `THIRD_PARTY_NOTICES` file if any license requires attribution.

## Report

A table: package, version, license, risk (ok, review, blocker), and the reason. List unknowns separately. Recommend an action for each blocker (replace, isolate, ask the author, or consult counsel).

Do not state that something is "legal" or "safe to ship". State that no blockers were found by this inventory.
