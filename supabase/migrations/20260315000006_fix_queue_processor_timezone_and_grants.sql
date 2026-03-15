-- Fix: queue stays pending because (1) cron may use different timezone than SQL Editor,
-- so CURRENT_DATE in processor didn't match enqueued run_date; (2) cron runs as postgres,
-- so postgres needs grants. Run this in SQL Editor, then run SELECT process_sales_processing_queue(15);

-- 1) Processor: use run_date from pending rows instead of CURRENT_DATE
CREATE OR REPLACE FUNCTION public.process_sales_processing_queue(p_batch_size integer DEFAULT 15)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job      RECORD;
  v_run_date date;
  v_inserted integer;
  v_processed integer := 0;
  v_error_msg text;
BEGIN
  PERFORM pg_catalog.set_config('statement_timeout', '300000', true);

  SELECT MIN(run_date) INTO v_run_date
  FROM   sales_processing_queue
  WHERE  status = 'pending';
  IF v_run_date IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_job IN
    SELECT id, customer_id, customer_name
    FROM   sales_processing_queue
    WHERE  run_date = v_run_date
      AND  status  = 'pending'
    ORDER  BY customer_id
    LIMIT  p_batch_size
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE sales_processing_queue
    SET    status = 'running', started_at = clock_timestamp()
    WHERE  id = v_job.id;

    BEGIN
      v_inserted := process_dealer_sales(v_job.customer_id, v_run_date);
      UPDATE sales_processing_queue
      SET    status = 'success', completed_at = clock_timestamp(),
             rows_inserted = v_inserted
      WHERE  id = v_job.id;
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error_msg := SQLERRM;
      UPDATE sales_processing_queue
      SET    status = 'error', completed_at = clock_timestamp(),
             rows_inserted = 0, error_message = v_error_msg
      WHERE  id = v_job.id;
      v_processed := v_processed + 1;
    END;
  END LOOP;

  RETURN v_processed;
END;
$$;

-- 2) Let cron (often runs as postgres) access queue and run the processor
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_processing_queue TO postgres;
GRANT EXECUTE ON FUNCTION public.enqueue_daily_sales_processing() TO postgres;
GRANT EXECUTE ON FUNCTION public.process_sales_processing_queue(integer) TO postgres;
