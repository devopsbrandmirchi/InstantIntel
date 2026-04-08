-- ============================================================
-- Run sold-out VIN processing after daily sales queue finishes
--
-- Typical setup (from 20260315000004 + 00008):
--   - daily-sales-enqueue        → enqueue_daily_sales_processing (02:00)
--   - daily-sales-process-queue  → process_sales_processing_queue(1) every 2 min
--
-- This migration adds:
--   1) soldout_vins_cron_run     — at most one successful sold-out run per calendar day
--   2) try_run_soldout_vins_after_sales_queue() — if today's queue has no pending/running,
--      run run_soldout_vins_processing() once
--   3) run_daily_sales_processing_then_soldout_vins() — optional: monolithic sales then sold-out
--      in one call (use if you do NOT use the queue; see comments)
--   4) pg_cron job soldout-vins-after-sales-queue — every 15 minutes (tune as needed)
--
-- Requires: pg_cron extension enabled (Supabase Dashboard → Database → Extensions).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.soldout_vins_cron_run (
  run_date      date PRIMARY KEY,
  completed_at  timestamptz,
  rows_inserted bigint
);

COMMENT ON TABLE public.soldout_vins_cron_run IS
  'Guards try_run_soldout_vins_after_sales_queue so soldoutvins rebuild runs at most once per run_date after sales queue drains.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.soldout_vins_cron_run TO postgres;

-- ------------------------------------------------------------------
-- A) Queue-aware: run sold-out only when sales_processing_queue has
--    rows for today and none are pending or running.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.try_run_soldout_vins_after_sales_queue()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_date   date := CURRENT_DATE;
  v_has_queue  integer;
  v_pending    integer;
  v_lock       date;
  v_result     jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.tables
    WHERE  table_schema = 'public'
      AND  table_name   = 'sales_processing_queue'
  ) THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'sales_processing_queue_table_missing',
      'hint', 'Use run_daily_sales_processing_then_soldout_vins() or a fixed-time cron on run_soldout_vins_processing()'
    );
  END IF;

  SELECT COUNT(*) INTO v_has_queue
  FROM   public.sales_processing_queue
  WHERE  run_date = v_run_date;

  IF v_has_queue = 0 THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'no_sales_queue_for_today',
      'hint', 'Enqueue not run yet for this date, or you use monolithic run_daily_sales_processing only'
    );
  END IF;

  SELECT COUNT(*) INTO v_pending
  FROM   public.sales_processing_queue
  WHERE  run_date = v_run_date
    AND  status IN ('pending', 'running');

  IF v_pending > 0 THEN
    RETURN jsonb_build_object(
      'skipped', true,
      'reason', 'sales_queue_pending',
      'pending_or_running', v_pending
    );
  END IF;

  INSERT INTO public.soldout_vins_cron_run (run_date)
  VALUES (v_run_date)
  ON CONFLICT (run_date) DO NOTHING
  RETURNING run_date INTO v_lock;

  IF v_lock IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_completed_today');
  END IF;

  BEGIN
    SELECT public.run_soldout_vins_processing() INTO v_result;

    UPDATE public.soldout_vins_cron_run
    SET    completed_at = clock_timestamp(),
           rows_inserted = NULLIF((v_result->>'rows_soldoutvins'), '')::bigint
    WHERE  run_date = v_run_date;

    RETURN v_result;
  EXCEPTION WHEN OTHERS THEN
    DELETE FROM public.soldout_vins_cron_run WHERE run_date = v_run_date;
    RAISE;
  END;
END;
$$;

COMMENT ON FUNCTION public.try_run_soldout_vins_after_sales_queue() IS
  'If sales_processing_queue for CURRENT_DATE has no pending/running rows, runs run_soldout_vins_processing once per day (guarded).';

-- ------------------------------------------------------------------
-- B) Monolithic path: one transaction after full run_daily_sales_processing
--    (only if you run the all-in-one function, not the queue processor)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_daily_sales_processing_then_soldout_vins()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM public.run_daily_sales_processing();
  SELECT public.run_soldout_vins_processing() INTO v;
  RETURN v;
END;
$$;

COMMENT ON FUNCTION public.run_daily_sales_processing_then_soldout_vins() IS
  'Runs run_daily_sales_processing() then run_soldout_vins_processing(); use as a single cron if you do not use sales_processing_queue.';

GRANT EXECUTE ON FUNCTION public.try_run_soldout_vins_after_sales_queue() TO postgres;
GRANT EXECUTE ON FUNCTION public.run_daily_sales_processing_then_soldout_vins() TO postgres;
GRANT EXECUTE ON FUNCTION public.try_run_soldout_vins_after_sales_queue() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_daily_sales_processing_then_soldout_vins() TO service_role;

-- ------------------------------------------------------------------
-- Cron: poll every 15 minutes; first successful window after queue drains
-- ------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'soldout-vins-after-sales-queue') THEN
    PERFORM cron.unschedule('soldout-vins-after-sales-queue');
  END IF;
END $$;

SELECT cron.schedule(
  'soldout-vins-after-sales-queue',
  '*/15 * * * *',
  $$SELECT public.try_run_soldout_vins_after_sales_queue()$$
);
