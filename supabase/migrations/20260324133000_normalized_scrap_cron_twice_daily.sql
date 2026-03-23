-- Reschedule normalized inventory sync from scrap to run twice daily:
-- 03:30 UTC and 09:30 UTC.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'normalized-inventory-from-scrap-daily'
  ) THEN
    PERFORM cron.unschedule('normalized-inventory-from-scrap-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'normalized-inventory-from-scrap-daily',
  '30 3,9 * * *',
  $$SELECT public.run_normalized_inventory_from_scrap(CURRENT_DATE)$$
);
