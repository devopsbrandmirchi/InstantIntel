-- If process_sales_processing_queue(15) returns 0 while rows are pending, the rows
-- may be locked by another session (e.g. Table Editor). Use FOR UPDATE (wait for lock)
-- instead of FOR UPDATE SKIP LOCKED so the processor can run while the table is open.
-- Also: overload with explicit run_date so you can force a date: process_sales_processing_queue('2026-03-15'::date, 15)
--
-- Note: Running the processor from Supabase SQL Editor with a large batch can cause
-- "NetworkError when attempting to fetch resource" because the request times out.
-- Prefer: let cron run it every 5 min, or run with batch size 1 repeatedly from the Editor.

CREATE OR REPLACE FUNCTION public.process_sales_processing_queue(p_batch_size integer DEFAULT 15)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_date date;
BEGIN
  SELECT MIN(run_date) INTO v_run_date
  FROM   public.sales_processing_queue
  WHERE  status = 'pending';
  IF v_run_date IS NULL THEN
    RETURN 0;
  END IF;
  RETURN public.process_sales_processing_queue(v_run_date, p_batch_size);
END;
$$;

-- Overload: process a specific run_date (use when you know the date and want to avoid lock/skip issues)
CREATE OR REPLACE FUNCTION public.process_sales_processing_queue(
  p_run_date   date,
  p_batch_size integer DEFAULT 15
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job       RECORD;
  v_inserted  integer;
  v_processed integer := 0;
  v_error_msg text;
BEGIN
  PERFORM pg_catalog.set_config('statement_timeout', '300000', true);

  -- Wait for lock instead of SKIP LOCKED so we don't get 0 when Table Editor has the table open
  FOR v_job IN
    SELECT id, customer_id, customer_name
    FROM   public.sales_processing_queue
    WHERE  run_date = p_run_date
      AND  status  = 'pending'
    ORDER  BY customer_id
    LIMIT  p_batch_size
    FOR UPDATE
  LOOP
    UPDATE public.sales_processing_queue
    SET    status = 'running', started_at = clock_timestamp()
    WHERE  id = v_job.id;

    BEGIN
      v_inserted := process_dealer_sales(v_job.customer_id, p_run_date);
      UPDATE public.sales_processing_queue
      SET    status = 'success', completed_at = clock_timestamp(),
             rows_inserted = v_inserted
      WHERE  id = v_job.id;
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error_msg := SQLERRM;
      UPDATE public.sales_processing_queue
      SET    status = 'error', completed_at = clock_timestamp(),
             rows_inserted = 0, error_message = v_error_msg
      WHERE  id = v_job.id;
      v_processed := v_processed + 1;
    END;
  END LOOP;

  RETURN v_processed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_sales_processing_queue(integer) TO postgres;
GRANT EXECUTE ON FUNCTION public.process_sales_processing_queue(date, integer) TO postgres;
