# Migration source status

Last audited: 2026-11-05  
Supabase project: `niwapjafzaizlnenuyui`

## Current status

- Supabase reports **35 applied migrations**.
- This repository currently tracks **18 SQL migration files**.
- **17 applied migrations** do not yet have their SQL source in this repository. This includes 16 historical migrations predating the security-hardening series and `20261105035120_guestops_identity_and_workspace_integrity_v1`.
- The Supabase migration history available through the project records migration versions and names, but it does not provide the missing SQL source text.

The eight migrations tracked from the 2026-11-05 security-hardening series are committed here and match the versions recorded by Supabase.

## Important safety note

Do not treat this folder as a complete rebuild history yet.

Until the missing historical SQL is recovered or a reviewed baseline is prepared:

- Do not run `supabase db reset` against the production project.
- Do not use this folder alone to bootstrap a replacement database.
- Do not delete, rename, or rewrite applied migration history to make the counts match.
- Do not invent replacement SQL for the missing versions.

## Recovery plan

1. Look for the original SQL in prior development sessions, exports, backups, or archived branches.
2. Compare any recovered SQL against the current live schema in read-only mode.
3. If the original source cannot be recovered, prepare a separately reviewed baseline for new environments. Keep the existing production migration history intact.
4. For every new production migration, commit the exact SQL file to this folder and verify its version against Supabase migration history.

The live database remains the source of truth until the historical source gap is resolved.
