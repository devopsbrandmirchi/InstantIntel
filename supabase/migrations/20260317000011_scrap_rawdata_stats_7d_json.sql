-- Align 7-day window with DB: today through today-6 inclusive (7 calendar days including today).
-- Return JSON so the UI uses the same dates as aggregation (avoids UTC vs local column mismatch).

DROP FUNCTION IF EXISTS public.get_scrap_rawdata_stats_7d();

CREATE OR REPLACE FUNCTION public.get_scrap_rawdata_stats_7d()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_end   date := CURRENT_DATE;
  v_start date := CURRENT_DATE - 6; -- 7 days: start .. end inclusive
BEGIN
  RETURN jsonb_build_object(
    'range_start', v_start::text,
    'range_end',   v_end::text,
    'dates', (
      SELECT COALESCE(
        jsonb_agg(to_char(s.d, 'YYYY-MM-DD') ORDER BY s.d DESC),
        '[]'::jsonb
      )
      FROM generate_series(v_start, v_end, interval '1 day') AS s(d)
    ),
    'stats', (
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'dealership_name',    x.dealership_name,
            'stat_date',          x.stat_date::text,
            'row_count',          x.row_count,
            'distinct_vin_count', x.distinct_vin_count
          )
        ),
        '[]'::jsonb
      )
      FROM (
        SELECT
          r.dealership_name,
          r.creation_date::date AS stat_date,
          COUNT(*)::bigint AS row_count,
          COUNT(DISTINCT NULLIF(TRIM(COALESCE(r.vin, '')), ''))::bigint AS distinct_vin_count
        FROM public.scrap_rawdata r
        WHERE r.creation_date >= v_start
          AND r.creation_date <= v_end
          AND r.dealership_name IS NOT NULL
          AND TRIM(r.dealership_name) <> ''
        GROUP BY r.dealership_name, r.creation_date::date
      ) x
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_scrap_rawdata_stats_7d() IS
  '7 calendar days including today (DB CURRENT_DATE): row + distinct VIN counts per dealership per day. Returns JSON { range_start, range_end, dates[], stats[] }.';

GRANT EXECUTE ON FUNCTION public.get_scrap_rawdata_stats_7d() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_scrap_rawdata_stats_7d() TO service_role;
