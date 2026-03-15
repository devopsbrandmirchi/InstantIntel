-- ============================================================
-- Sales processing: stop using Edge Function (avoids timeout).
-- Run the job on a schedule with pg_cron and optionally "run now"
-- from SQL Editor. No Postman/Edge Function needed.
-- ============================================================

-- 1. Remove the trigger that called the Edge Function via pg_net (no longer used)
DROP FUNCTION IF EXISTS public.trigger_daily_sales_processing(text, text);

-- 2. Schedule daily run with pg_cron (runs in DB, no timeout)
-- If cron.schedule fails, enable pg_cron: Dashboard → Database → Extensions → pg_cron
-- Or create the job from Dashboard → Integrations → Cron → Create job (SQL: SELECT run_daily_sales_processing(); schedule: 0 2 * * *).
SELECT cron.schedule(
  'daily-sales-processing',
  '0 2 * * *',
  $$SELECT public.run_daily_sales_processing()$$
);

-- To change the schedule later:
--   SELECT cron.unschedule('daily-sales-processing');
--   SELECT cron.schedule('daily-sales-processing', '0 3 * * *', $$SELECT public.run_daily_sales_processing()$$);
-- To run manually: SELECT run_daily_sales_processing();
