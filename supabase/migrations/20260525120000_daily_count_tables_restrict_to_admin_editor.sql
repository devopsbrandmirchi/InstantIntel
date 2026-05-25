-- ============================================================
-- Restrict access to public.inventory_daily_count and public.sales_daily_count
-- to users whose role is 'admin' or 'editor' only.
--
-- Mirrors the front-end RoleRoute for /inventory-daily-count and /daily-sales-count.
-- Other authenticated roles (viewer, moderator, …) get an empty result set even
-- if they hit the PostgREST endpoint directly with their JWT.
--
-- Background job paths are unchanged: run_inventory_daily_count() and
-- run_sales_daily_count() are SECURITY DEFINER and the cron worker runs as
-- postgres / service_role, both of which bypass RLS. So daily refresh keeps
-- working.
--
-- Idempotent. Run in: Supabase Dashboard → SQL Editor.
-- ============================================================

-- ---------- inventory_daily_count ---------------------------

ALTER TABLE public.inventory_daily_count ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_daily_count_select_admin_editor
  ON public.inventory_daily_count;

CREATE POLICY inventory_daily_count_select_admin_editor
  ON public.inventory_daily_count
  FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'editor'));

-- Make sure no anon / public access remains.
REVOKE ALL ON public.inventory_daily_count FROM anon;
GRANT  SELECT ON public.inventory_daily_count TO authenticated;

-- ---------- sales_daily_count -------------------------------

ALTER TABLE public.sales_daily_count ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_daily_count_select_admin_editor
  ON public.sales_daily_count;

CREATE POLICY sales_daily_count_select_admin_editor
  ON public.sales_daily_count
  FOR SELECT
  TO authenticated
  USING (public.get_my_role() IN ('admin', 'editor'));

REVOKE ALL ON public.sales_daily_count FROM anon;
GRANT  SELECT ON public.sales_daily_count TO authenticated;

-- ---------- Notes -------------------------------------------
-- 1. No INSERT/UPDATE/DELETE policies are added for `authenticated`. With RLS
--    enabled and no matching policy, those operations are denied for the
--    authenticated role, matching current grants in
--    20260317000009_inventory_daily_count_and_cron.sql and
--    20260324162000_sales_daily_count_and_cron.sql.
-- 2. public.get_my_role() is SECURITY DEFINER and queries user_roles/roles as
--    the function owner, so the policy does not recursively trigger RLS on
--    those tables.
-- 3. service_role (BYPASSRLS) and postgres (superuser) bypass RLS, so the
--    SECURITY DEFINER refresh functions run_inventory_daily_count() and
--    run_sales_daily_count() continue to TRUNCATE/INSERT from the cron job.
