-- ============================================================
-- Hide dashboard data from users with role 'viewer' at the database level.
--
-- Mirrors the front-end Dashboard.jsx blank-render for viewers. Even if a
-- viewer calls these RPCs directly with their JWT (bypassing the UI), they
-- get zero rows / zero counts.
--
-- The five functions are LANGUAGE sql SECURITY DEFINER. We keep signatures
-- and behavior identical for admin / editor / moderator (and any non-viewer
-- role); only the inner WHERE clause is extended with
-- `public.get_my_role() IS DISTINCT FROM 'viewer'`. For confirmed viewer
-- callers the predicate is false for every row, so:
--   - TABLE-returning RPCs produce an empty result set.
--   - Scalar / single-row RPCs produce zero counts.
-- NULL (anon / no user_roles row) is treated as "not viewer" by IS DISTINCT
-- FROM, preserving the pre-existing anon grant on get_saleprocessedvins_summary.
--
-- Idempotent. Run in: Supabase Dashboard → SQL Editor.
-- ============================================================

-- ---------- get_inventory_customer_count -------------------------------
-- Source: supabase/migrations/get_inventory_customer_count.sql

CREATE OR REPLACE FUNCTION public.get_inventory_customer_count()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT customer_id)::bigint
  FROM public.inventorydata
  WHERE customer_id IS NOT NULL
    AND public.get_my_role() IS DISTINCT FROM 'viewer';
$$;

COMMENT ON FUNCTION public.get_inventory_customer_count() IS 'Returns count of distinct customer_id in inventorydata for dashboard. Returns 0 for viewer role.';
GRANT EXECUTE ON FUNCTION public.get_inventory_customer_count() TO authenticated;

-- ---------- get_daily_inventory_by_customer ----------------------------
-- Source: supabase/migrations/get_daily_inventory_by_customer.sql

CREATE OR REPLACE FUNCTION public.get_daily_inventory_by_customer()
RETURNS TABLE(day date, customer_id bigint, cnt bigint)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    (pull_date::date) AS day,
    inventorydata.customer_id,
    COUNT(*)::bigint AS cnt
  FROM public.inventorydata
  WHERE pull_date::date >= date_trunc('month', current_date)::date
    AND pull_date::date < (date_trunc('month', current_date) + interval '1 month')::date
    AND inventorydata.customer_id IS NOT NULL
    AND public.get_my_role() IS DISTINCT FROM 'viewer'
  GROUP BY pull_date::date, inventorydata.customer_id
  ORDER BY day, customer_id;
$$;

COMMENT ON FUNCTION public.get_daily_inventory_by_customer() IS 'Returns daily inventory counts per customer for current month (dashboard chart). Empty for viewer role.';
GRANT EXECUTE ON FUNCTION public.get_daily_inventory_by_customer() TO authenticated;

-- ---------- get_daily_sales_current_month ------------------------------
-- Source: supabase/migrations/get_daily_sales_current_month.sql

CREATE OR REPLACE FUNCTION public.get_daily_sales_current_month()
RETURNS TABLE(day date, cnt bigint, total_value numeric)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    final_sold_date::date AS day,
    COUNT(*)::bigint AS cnt,
    COALESCE(SUM(
      COALESCE(
        (NULLIF(REGEXP_REPLACE(COALESCE(TRIM(price), '0'), '[^0-9.]', '', 'g'), '')::numeric),
        0
      )
    ), 0)::numeric AS total_value
  FROM public.saleprocessedvins
  WHERE final_sold_date IS NOT NULL
    AND final_sold_date::date >= date_trunc('month', current_date)::date
    AND final_sold_date::date < (date_trunc('month', current_date) + interval '1 month')::date
    AND public.get_my_role() IS DISTINCT FROM 'viewer'
  GROUP BY final_sold_date::date
  ORDER BY day;
$$;

COMMENT ON FUNCTION public.get_daily_sales_current_month() IS 'Returns daily sales count and total value for current month (dashboard sales chart). Empty for viewer role.';
GRANT EXECUTE ON FUNCTION public.get_daily_sales_current_month() TO authenticated;

-- ---------- get_daily_sales_by_customer --------------------------------
-- Source: supabase/migrations/get_daily_sales_by_customer.sql

CREATE OR REPLACE FUNCTION public.get_daily_sales_by_customer()
RETURNS TABLE(day date, customer_id bigint, cnt bigint, total_value numeric)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH month_start AS (
    SELECT date_trunc('month', current_date)::date AS d
  ),
  month_next AS (
    SELECT ((SELECT d FROM month_start) + interval '1 month')::date AS d
  ),
  month_end AS (
    SELECT ((SELECT d FROM month_next) - interval '1 day')::date AS d
  ),
  customers_from_inventory AS (
    SELECT DISTINCT i.customer_id
    FROM public.inventorydata i
    WHERE i.customer_id IS NOT NULL
      AND i.pull_date::date >= (SELECT d FROM month_start)
      AND i.pull_date::date < (SELECT d FROM month_next)
  ),
  customers_from_sales AS (
    SELECT DISTINCT s.customer_id
    FROM public.saleprocessedvins s
    WHERE s.customer_id IS NOT NULL
      AND s.final_sold_date IS NOT NULL
      AND s.final_sold_date::date >= (SELECT d FROM month_start)
      AND s.final_sold_date::date < (SELECT d FROM month_next)
  ),
  customers_for_chart AS (
    SELECT customer_id FROM customers_from_inventory
    UNION
    SELECT customer_id FROM customers_from_sales
  ),
  days_in_month AS (
    SELECT generate_series(
      (SELECT d FROM month_start),
      (SELECT d FROM month_end),
      '1 day'::interval
    )::date AS day
  ),
  aggregated AS (
    SELECT
      final_sold_date::date AS day,
      customer_id,
      COUNT(*)::bigint AS cnt,
      COALESCE(SUM(
        COALESCE(
          (NULLIF(REGEXP_REPLACE(COALESCE(TRIM(price), '0'), '[^0-9.]', '', 'g'), '')::numeric),
          0
        )
      ), 0)::numeric AS total_value
    FROM public.saleprocessedvins
    WHERE final_sold_date IS NOT NULL
      AND customer_id IS NOT NULL
      AND final_sold_date::date >= (SELECT d FROM month_start)
      AND final_sold_date::date < (SELECT d FROM month_next)
    GROUP BY final_sold_date::date, customer_id
  )
  SELECT
    dm.day,
    c.customer_id,
    COALESCE(a.cnt, 0)::bigint AS cnt,
    COALESCE(a.total_value, 0)::numeric AS total_value
  FROM days_in_month dm
  CROSS JOIN customers_for_chart c
  LEFT JOIN aggregated a ON a.day = dm.day AND a.customer_id = c.customer_id
  WHERE public.get_my_role() IS DISTINCT FROM 'viewer'
  ORDER BY dm.day, c.customer_id;
$$;

COMMENT ON FUNCTION public.get_daily_sales_by_customer() IS 'Daily sales by customer for current month (dashboard chart). Empty for viewer role.';
GRANT EXECUTE ON FUNCTION public.get_daily_sales_by_customer() TO authenticated;

-- ---------- get_saleprocessedvins_summary ------------------------------
-- Source: supabase/migrations/20260315000009_get_saleprocessedvins_summary.sql
-- Note: existing grants include anon — preserved here to avoid behavior change
--       outside the viewer guard.

CREATE OR REPLACE FUNCTION public.get_saleprocessedvins_summary()
RETURNS TABLE(total_rows bigint, customer_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*)::bigint AS total_rows,
    COUNT(DISTINCT customer_id)::bigint AS customer_count
  FROM public.saleprocessedvins
  WHERE public.get_my_role() IS DISTINCT FROM 'viewer';
$$;

COMMENT ON FUNCTION public.get_saleprocessedvins_summary() IS 'Returns total rows and distinct customer count in saleprocessedvins for dashboard. Returns 0/0 for viewer role.';
GRANT EXECUTE ON FUNCTION public.get_saleprocessedvins_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_saleprocessedvins_summary() TO anon;
GRANT EXECUTE ON FUNCTION public.get_saleprocessedvins_summary() TO service_role;

-- ---------- Notes -----------------------------------------------------
-- 1. public.get_my_role() is SECURITY DEFINER and STABLE; calling it inside
--    a SECURITY DEFINER function is safe and not subject to RLS recursion.
-- 2. anon callers of get_saleprocessedvins_summary() have role = NULL via
--    get_my_role(); `NULL IS DISTINCT FROM 'viewer'` is true, so anon keeps
--    its pre-existing access. Only confirmed viewer JWTs are blocked.
-- 3. service_role / postgres callers (cron, edge functions) are unaffected
--    because their role is not 'viewer'.
