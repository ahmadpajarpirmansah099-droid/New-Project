# Implementation and rollout

## Follow-up review — 11 November 2026

See `review-followup-2026-11-11.md` for user decisions, intended behavior, security boundaries, fixes, regression coverage, and remaining verification. PR #226 has merged and its post-merge workflow succeeded. A read-only database check confirms the Stock Opname schema is still absent. Use the reviewed, corrected `schema.sql` from the follow-up PR for the initial installation after owner approval; do not apply the original PR #226 SQL.

The follow-up adds guards for cancelled/targetless Moves, separates expense categories from receipt/production/Sales, protects local drafts from silent replacement, and completes the desktop counting columns/master-data guidance. SQL tests ran against disposable local Postgres/WASM with a minimal foundation fixture, not the production Supabase schema. Full production-account and responsive browser verification remain pending.

## Deployment order

1. Review `schema.sql` and apply it as one additive Supabase migration before merging the frontend. The change creates only the Stock Opname tables/functions and enables the existing Lazy Jennie / Bar scope by name. No initial quantities or transactions are seeded.
2. Merge frontend after database checks pass. The navigation remains hidden when the schema is unavailable; other modules continue loading.
3. Verify with the existing Bar division administrator. Developer sees activation controls rather than operational stock data.

The SQL has been executed with the database fixture inside a transaction ending in ROLLBACK. This verifies definitions and business operations without leaving schema or test data behind. Production installation is pending review/merge.

## Integrity

- Server calculates stock movements, conversion, recipe consumption, invoice prices and variance from the protected master catalog.
- Only division_admin membership plus protected admin profile and explicit division assignment can operate enabled scopes.
- Private SECURITY DEFINER entry helpers check identity and scope; exposed RPC wrappers are SECURITY INVOKER. Tables have RLS and no authenticated write grants.
- Version checks prevent lost inventory updates. Request UUID + payload hash prevents duplicate or mismatched retries.
- Transfers and linked reversals update both scopes in one transaction under a serialization lock.
- Reopening the latest closed period holds the following period. Existing later transactions remain retained and are recomputed against the reconfirmed physical opening.
- Mapping inventory between divisions is explicit and requires the same base unit; independently maintained catalogs need not share IDs.
- Drafts are local to account/workspace/division. A pending-period draft is restored and explicitly saved after opening confirmation; it never silently posts while the opening is pending.

## Validation

- Existing Node test suite plus new service tests: 67 passing.
- Rollback database scenarios: initial/production/conversion/Sales without double consumption, overlap guard, invoice price update, WIP waste, atomic Move, optimistic conflict, required counts, variance, pending confirmation, rollover, reopen/hold/reconfirm, linked Move reversal, negative stock, authenticated read/direct-write denial, anonymous rejection.
- Browser: direct quantity/unit entry, draft save and restoration after reload; compact form at 320px iframe viewport (305px content area with scrollbar) with equal scrollWidth/clientWidth. Browser test uses controlled fixtures, not a production account.

## Limits and follow-up

- Excel intentionally deferred to phase two.
- Database migration and authenticated production browser smoke test are still required before calling the feature live.
- A single serialization lock favors correctness over throughput for the initial outlet. Full per-document catalog snapshots and JSON period storage should be measured before broad rollout.
- MasterDataStore now conditionally writes the version it loaded, so a stale master editing tab cannot overwrite an invoice price update. It asks the administrator to reload on a conflict.

## Design review

Dense operational ledger, inherited New-Project typography and lime/navy identity, 44px controls, functional transitions and reduced-motion support. AI-slop score 1/10; distinctiveness 8/10; implementation direction readiness 9/10. Remaining visual verification: the authenticated full app shell, beyond the isolated form fixture.
