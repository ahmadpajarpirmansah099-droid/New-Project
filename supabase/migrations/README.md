# Migration source status

Last audited: 2026-11-15  
Supabase project: `niwapjafzaizlnenuyui`

## Current status

Read-only comparison of the live Supabase migration history with `main` found:

- **49 migrations applied** in Supabase.
- **28 SQL migration files** tracked in this repository after the current pending change.
- **21 files** have versions matching an applied live migration.
- **28 applied live migrations** have no matching SQL source file in this repository.
- **6 tracked migration files** have versions not present in the live migration history.
- `20261115120000_secure_guest_correction_and_move_destination_access_v1.sql` is a new proposed migration and is **not applied** to Supabase.

The prior counts in this README were from 2026-11-05 and are superseded by this comparison.

## Important safety note

Do not treat this folder as a complete rebuild history yet.

Until the missing historical SQL is recovered or a separately reviewed baseline is prepared:

- Do not run `supabase db reset` against the production project.
- Do not use this folder alone to bootstrap a replacement database.
- Do not delete, rename, or rewrite applied migration history to make the counts match.
- Do not invent replacement SQL for the missing versions.
- Apply the proposed migration only after its code review and database regression test pass.

## Recovery plan

1. Look for the original SQL in prior development sessions, exports, backups, or archived branches.
2. Compare recovered SQL against the current live schema in read-only mode.
3. If the original source cannot be recovered, prepare a separately reviewed baseline for new environments. Keep existing production migration history intact.
4. Commit the exact SQL for every new production migration and verify its version against Supabase migration history.

The live database remains the source of truth until the historical source gap is resolved.
