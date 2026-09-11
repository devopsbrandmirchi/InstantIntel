-- soldoutvins had RLS enabled with zero policies (same as inventorydata / saleprocessedvins).
-- Fixes Sale Pending Report empty UI when data exists in DB.

ALTER TABLE public.soldoutvins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS soldoutvins_authenticated_select ON public.soldoutvins;

CREATE POLICY soldoutvins_authenticated_select
ON public.soldoutvins
FOR SELECT
TO authenticated
USING (true);

GRANT SELECT ON public.soldoutvins TO authenticated;
