-- Speed active-client lookups used by report dropdowns
-- (sorted in app by numeric parent_client, then full_name).

CREATE INDEX IF NOT EXISTS idx_clients_active_parent_full_name
  ON public.clients (parent_client, full_name)
  WHERE is_active IS TRUE;
