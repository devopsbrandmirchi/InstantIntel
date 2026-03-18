-- Statistics only: row count + distinct VIN count per dealership_name per day (last 7 days incl. today)

CREATE OR REPLACE FUNCTION public.get_scrap_rawdata_stats_7d()
RETURNS TABLE (
  dealership_name      text,
  stat_date            date,
  row_count            bigint,
  distinct_vin_count   bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.dealership_name,
    r.creation_date::date AS stat_date,
    COUNT(*)::bigint AS row_count,
    COUNT(DISTINCT NULLIF(TRIM(COALESCE(r.vin, '')), ''))::bigint AS distinct_vin_count
  FROM public.scrap_rawdata r
  WHERE r.creation_date >= (CURRENT_DATE - INTERVAL '6 days')
    AND r.creation_date <= CURRENT_DATE
    AND r.dealership_name IS NOT NULL
    AND TRIM(r.dealership_name) <> ''
  GROUP BY r.dealership_name, r.creation_date::date
  ORDER BY r.dealership_name, stat_date DESC;
$$;

COMMENT ON FUNCTION public.get_scrap_rawdata_stats_7d() IS
  'Row count and distinct non-empty VIN count per dealership_name per day for last 7 days (incl. today).';

GRANT EXECUTE ON FUNCTION public.get_scrap_rawdata_stats_7d() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_scrap_rawdata_stats_7d() TO service_role;
