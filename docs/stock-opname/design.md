# Stock Opname: implementation direction

Operational inventory ledger for division administrators. Preserve the existing New-Project navy/lime identity and font. The primary action is counting physical inventory, not reading decorative KPIs.

Use a dense ledger layout: one material per row, an editable quantity and unit selector. On phones, system stock sits below the name inside the same row; columns use minmax(0,1fr), 76px, 82px. No horizontal scrolling or card drill-down. Desktop expands the same structure into a table.

Tokens: inherit application font; navy #172b42, muted #586575, lime #d4ed92, white surface, border #dce3dc. Spacing 4/8/12/16/24px. Inputs 44px high, 8px radius. One subtle section shadow, no per-row elevation. Lucide icons only. Functional 160ms focus/button transitions; respect reduced motion. No hover transforms on inventory rows.

Counting forms show separate system-stock and converted-physical columns from 900px. Below that breakpoint these read-only columns are hidden, and system stock remains beneath the material name. Blank quantities show a dash in the conversion column, not an assumed zero. Missing recipes retain their explanation and offer navigation to the existing master pages. This extends the existing dense operational table; it introduces no new palette, icon library, or motion.

States: loading, denied, empty catalog with Master Data link, local draft versus confirmed persistence, validation error, negative stock warning, closed pending opening confirmation. Keep input visible on failures. Scope drafts to account/workspace/division and operation.

Quality gates: 320px and desktop layouts, keyboard labels/focus, reduced motion, no raw HTML from item names, no cross-account draft reuse. Existing guest operations must remain unchanged.
