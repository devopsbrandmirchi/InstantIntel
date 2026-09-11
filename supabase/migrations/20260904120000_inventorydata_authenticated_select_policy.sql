-- inventorydata had RLS enabled with zero policies, so authenticated API
-- selects returned empty while Table Editor (postgres) still showed rows.
-- Fixes Inventory Report / Sales Report empty UI when data exists in DB.

ALTER TABLE public.inventorydata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventorydata_authenticated_select ON public.inventorydata;

CREATE POLICY inventorydata_authenticated_select
ON public.inventorydata
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.inventorydata TO authenticated;
