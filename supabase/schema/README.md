# Database schema baseline

`2026-11-20-baseline.sql` is a full snapshot of the production schema: tables,
row level security policies, triggers, and the private helper functions.

Why it exists: 17 historical migrations are missing from `../migrations/`, so the
migration folder alone cannot rebuild the database. This file can.

- It contains **no data** and no credentials.
- It assumes a Supabase project, which supplies the `auth` schema and the
  `anon`, `authenticated`, and `service_role` roles.
- New changes should still be written as migrations. Refresh this baseline only
  when the migration gap is closed.
