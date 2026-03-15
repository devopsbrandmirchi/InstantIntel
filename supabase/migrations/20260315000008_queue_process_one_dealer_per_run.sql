-- Process one dealer per cron run (each dealer has huge data; avoids long runs and timeouts).
-- Reschedule the queue processor: every 2 minutes, batch size 1.

SELECT cron.unschedule('daily-sales-process-queue');

SELECT cron.schedule(
  'daily-sales-process-queue',
  '*/2 * * * *',
  $$SELECT public.process_sales_processing_queue(1)$$
);
