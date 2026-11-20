# Calendar-month Stock Opname — implementation contract

Status: design contract for `feat/stock-opname-month-navigation`. This document is not evidence that the feature is implemented or deployed.

## User-visible behavior

1. The main page opens on the oldest period whose physical count is unfinished. Completing a later month must not silently move the main page away from an earlier unfinished month.
2. A month selector with previous/next controls lets the administrator inspect each calendar month independently. Viewing a month is separate from the period used for new transactions and from the physical count date.
3. Transactions dated in December are recorded against December even if November's physical count has not yet been completed.
4. While November is unfinished, December's provisional Stock Awal is zero. December transactions remain visible and are retained.
5. When November is completed, December Stock Awal is calculated from the November close's physical count, normalized to the December 1 opening boundary.
6. The physical count date can be later than the month being closed. Example: a November count physically performed on 3 December is still a November close.
7. For a 3 December physical count, December 1–3 movements are subtracted from the observed physical quantity to derive the normalized 1 December opening. December 1–3 movements are then included once in December's system balance.
8. Edits and voids to December transactions on or before the saved physical count date must recompute the normalized December opening from the saved November physical count and the current net December movements through that count date. This prevents drift and double counting.
9. Closing November must not delete, duplicate, overwrite, or reassign any December document.
10. A Sales date range must remain inside one calendar month. If it crosses a month boundary, the user records two separate Sales documents.

## Accounting definitions

- **Calendar period:** first through last calendar day of one month. This controls transaction ownership and month navigation.
- **Physical count date:** the date the stock was physically counted. This may be in the following calendar month and is stored separately from the calendar period end.
- **Normalized opening:** observed physical quantity on the count date minus all non-void movements in the next calendar month from day 1 through the physical count date, inclusive.
- **System balance:** normalized opening plus all non-void movements owned by the selected calendar month. Each document contributes once.

For item key `k`, if November is counted on December 3:

`DecemberOpening[k] = NovemberPhysical[k] - SUM(DecemberMovement[k], Dec 1..Dec 3)`

`DecemberSystem[k] = DecemberOpening[k] + SUM(DecemberMovement[k], Dec 1..selected cutoff)`

## Required server invariants

- Month identity is determined from document dates, not from whichever period happens to be the final element of the JSON array.
- A document's `period_id` identifies its calendar month and never changes merely because another month is closed.
- A close stores both the calendar period end and the physical count date.
- Closing a month is atomic with recalculation of the immediately following month's normalized opening.
- A later-month document create/edit/void recomputes the following month's normalized opening whenever its date range intersects the saved physical-count window.
- Recalculation excludes void documents and includes every valid posting exactly once.
- Sales month-boundary validation is enforced in both UI and database RPC.
- Existing request UUID idempotency, revision checks, advisory locking, Move atomicity, RLS, SECURITY DEFINER authorization checks, and historical document snapshots must remain intact.
- Legacy period IDs and documents must remain readable and reconcile to the existing stock balances during migration.

## Implementation sequence

1. Add regression tests for month assignment, navigation, provisional zero opening, delayed physical count, normalized opening, edit/void recomputation, and preservation of later-month documents.
2. Introduce the server-side calendar-period resolver and migrate existing state without changing any stock quantities or document ownership.
3. Update read/balance RPC output to return month-scoped periods, normalized openings, and selected-month balances while retaining existing access controls.
4. Update mutation RPCs so save/edit/void/Move use the document's calendar month, not the latest period array entry. Keep a provisional month writable while its opening is pending.
5. Update close/reopen/reactivate behavior to store physical count date separately and recalculate the next month's opening deterministically.
6. Add month navigation and selected-month rendering in the UI. Keep default selection on the oldest unfinished count and preserve form drafts across navigation.
7. Run the full Node suite and rollback-only SQL regression suite; inspect migration effects against a production snapshot before applying anything to production.
8. Only then open/merge a PR and separately deploy frontend and database migration in the safe order.

## Explicit non-goals

- Do not change or erase historical operational documents to make month totals appear correct.
- Do not use the selected display month as an implicit transaction date.
- Do not use the physical count date as the calendar period end.
- Do not auto-split a Sales quantity across months; the administrator enters each month's quantity in its own document.
