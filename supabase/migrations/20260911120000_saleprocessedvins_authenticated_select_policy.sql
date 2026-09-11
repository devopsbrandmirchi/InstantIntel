-- saleprocessedvins had RLS enabled with zero policies, so authenticated API
-- selects returned empty while Table Editor (postgres) still showed rows.
-- Fixes Sales Report empty UI when data exists in DB.

ALTER TABLE public.saleprocessedvins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saleprocessedvins_authenticated_select ON public.saleprocessedvins;

CREATE POLICY saleprocessedvins_authenticated_select
ON public.saleprocessedvins
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.saleprocessedvins TO authenticated;
