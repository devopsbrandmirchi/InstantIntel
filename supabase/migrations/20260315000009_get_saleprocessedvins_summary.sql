-- Summary for dashboard: total rows in saleprocessedvins and how many customers
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
  FROM public.saleprocessedvins;
$$;

COMMENT ON FUNCTION public.get_saleprocessedvins_summary() IS 'Returns total rows and distinct customer count in saleprocessedvins for dashboard.';

GRANT EXECUTE ON FUNCTION public.get_saleprocessedvins_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_saleprocessedvins_summary() TO anon;
GRANT EXECUTE ON FUNCTION public.get_saleprocessedvins_summary() TO service_role;
