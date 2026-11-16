-- Record how each new transfer was created.
-- Existing rows remain NULL because their origin cannot be inferred reliably.
ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS created_via TEXT;

COMMENT ON COLUMN public.transfers.created_via IS
  'Creation channel: partner_portal, manager, batch_import, or api. NULL for historical rows with unknown origin.';
