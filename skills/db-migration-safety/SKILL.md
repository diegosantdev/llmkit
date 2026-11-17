---
name: db-migration-safety
description: Use when changing a database schema, running a migration, backfilling data or touching production data; plans reversible, low-downtime changes with a backup and a tested rollback.
---

# Database migration safety

Data is the one thing git cannot restore. Treat every migration as irreversible until proven otherwise.

## Before

1. **Know the environment.** Never run a migration against a database you have not identified. Print the target host and database name and confirm it is not production unless that is the explicit task.
2. **Backup.** Take a dump or snapshot and verify it can be restored. Say where it is and how to restore it.
3. **Read the migration.** Look for `DROP`, `TRUNCATE`, `DELETE` without a tight `WHERE`, type changes that lose data, and `NOT NULL` additions without a default.
4. **Dry-run on a copy** or a staging database with realistic data volume.

## Design: expand, migrate, contract

For live systems avoid one big breaking step:

1. **Expand**: add the new column/table/index in a backward-compatible way (nullable or with default).
2. **Migrate**: deploy code that writes to both, backfill old rows in batches, verify counts.
3. **Contract**: after the old path has no readers, remove it in a later release.

Other rules:

- Create large indexes concurrently where the database supports it.
- Backfill in batches with pauses; never one transaction over millions of rows.
- Keep each migration small, ordered, and in version control. Never edit a migration that has already run elsewhere; add a new one.
- Write the `down` migration or the manual rollback steps, and test them.

## After

Verify with queries (row counts, null counts, sample rows), run the application's tests against the new schema, and record the result.

## Stop and ask

If the change drops or rewrites data, runs on production, or the backup cannot be verified, stop and get explicit confirmation from the user.
