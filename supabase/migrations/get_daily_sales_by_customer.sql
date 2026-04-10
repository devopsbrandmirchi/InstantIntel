-- ============================================================
-- Daily sales count and value per customer for the current month.
-- Customer set = UNION of customers with inventory pulls this month
-- and customers with sales this month (matches inventory chart scope).
-- ============================================================

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
  ORDER BY dm.day, c.customer_id;
$$;

COMMENT ON FUNCTION public.get_daily_sales_by_customer() IS 'Daily sales by customer for current month; customers = inventory pulls this month ∪ sales this month (dashboard parity with inventory chart).';

GRANT EXECUTE ON FUNCTION public.get_daily_sales_by_customer() TO authenticated;
