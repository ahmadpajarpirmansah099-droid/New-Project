ALTER TABLE public.inventory_transactions
  ADD COLUMN expense_category text;

ALTER TABLE public.inventory_transactions
  ADD CONSTRAINT inventory_transactions_expense_category_check
  CHECK (
    expense_category IS NULL
    OR (
      transaction_type = 'expense'
      AND expense_category = ANY (ARRAY[
        'Kalibrasi','Waste','QC','R&D','MOVE','SUPLIES','LAINNYA'
      ]::text[])
    )
  );

COMMENT ON COLUMN public.inventory_transactions.expense_category
  IS 'Kategori untuk transaksi Pengeluaran Daily SO; null untuk transaksi lain dan data lama.';
