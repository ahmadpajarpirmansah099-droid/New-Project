# Implementation and rollout

## Follow-up review — 11 November 2026

See `review-followup-2026-11-11.md` for user decisions, intended behavior, security boundaries, fixes, regression coverage, and remaining verification. Following explicit owner approval, PR #227 was merged as `e9b4f752648ac9a2b7001233bf80863afe3a4415`. The corrected `schema.sql` was installed as Supabase migration `20261110183229_stock_opname_phase_one_reviewed_v1` before the merge. Do not apply the original PR #226 SQL.

The follow-up adds guards for cancelled/targetless Moves, separates expense categories from receipt/production/Sales, protects local drafts from silent replacement, and completes the desktop counting columns/master-data guidance. Both SQL scripts passed locally and subsequently against the installed Supabase schema in separate transactions ending in ROLLBACK. Full authenticated browser and responsive verification remain pending.

## Deployment status — 11 November 2026 (Asia/Jakarta)

- Code: PR #226 and PR #227 merged.
- Frontend: [post-merge workflow 42876328652](https://github.com/ahmadpajarpirmansah099-droid/New-Project/actions/runs/42876328652) passed validation and GitHub Pages deployment. The public live login page loaded successfully in the browser. The live `stock-opname-ui.js` and `stock-opname.css` responses were HTTP 200 and matched the reviewed files byte-for-byte.
- Database: migration `20261110183229_stock_opname_phase_one_reviewed_v1` installed. Its SQL is exactly `docs/stock-opname/schema.sql` at PR #227 head `53603691cf909cfeabc33bc2092fd9b10f543068` (Git blob `738b81f8b4d5e81a9bea5af47282e870ed6a2241`).
- Activation: only Lazy Jennie / Bar enabled. One assigned admin and 159 valid inventory catalog rows were found; no other scope was enabled.
- Data: no opening quantities or operational transactions seeded; state/request tables and rollback test workspaces were empty after verification.
- Access: all three new tables have RLS, no anonymous SELECT, and no authenticated direct writes. The four public RPC wrappers are SECURITY INVOKER with authenticated-only execution. A transaction using the assigned admin's database role could read the enabled scope and could not read an unassigned scope.
- Remaining: browser session is unauthenticated. Database-role checks do not prove the complete login, operational UI, responsive layout, or real-account end-to-end flow. Phase two remains deferred.

## Deployment order

1. Review `schema.sql` and apply it as one additive Supabase migration before merging the frontend. The change creates only the Stock Opname tables/functions and enables the existing Lazy Jennie / Bar scope by name. No initial quantities or transactions are seeded.
2. Merge frontend after database checks pass. The navigation remains hidden when the schema is unavailable; other modules continue loading.
3. Verify with the existing Bar division administrator. Developer sees activation controls rather than operational stock data.

Production schema installation is complete. The database scenarios run after installation used isolated fixtures and transactions ending in ROLLBACK; test data did not persist. Operational inventory remains for the assigned administrator to initialize with real quantities.

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

- Node suite including the follow-up UI regression tests: 77 passing, 0 failures; syntax checks passed for 21 JavaScript files.
- Rollback database scenarios: initial/production/conversion/Sales without double consumption, overlap guard, invoice price update, WIP waste, atomic Move, optimistic conflict, required counts, variance, pending confirmation, rollover, reopen/hold/reconfirm, linked Move reversal, negative stock, authenticated read/direct-write denial, anonymous rejection.
- PR #226 reported browser fixture checks: direct quantity/unit entry, draft save/restoration after reload, compact form at a 320px iframe viewport (305px content area with scrollbar), equal scrollWidth/clientWidth. These checks use controlled fixtures, not a production account; follow-up visual changes have not been revalidated in an authenticated browser.
- Follow-up database regression scripts both passed on Supabase after migration, with ROLLBACK and no remaining test workspaces. See the follow-up record for cases and access checks.

## Limits and follow-up

- Excel intentionally deferred to phase two.
- Code deployment and database migration are complete; the authenticated production browser smoke test is still required before calling phase one fully verified.
- A single serialization lock favors correctness over throughput for the initial outlet. Full per-document catalog snapshots and JSON period storage should be measured before broad rollout.
- MasterDataStore now conditionally writes the version it loaded, so a stale master editing tab cannot overwrite an invoice price update. It asks the administrator to reload on a conflict.

## Design review

Dense operational ledger, inherited New-Project typography and lime/navy identity, 44px controls, functional transitions and reduced-motion support. AI-slop score 1/10; distinctiveness 8/10; implementation direction readiness 9/10. Remaining visual verification: the authenticated full app shell, beyond the isolated form fixture.
