-- Ensure the single-arg processor uses the queue's pending run_date (not CURRENT_DATE)
-- so manual run picks up pending rows regardless of session timezone.
-- Then you can use: SELECT process_sales_processing_queue(1);
-- Or force a date: SELECT process_sales_processing_queue('2026-03-15'::date, 1);

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

GRANT EXECUTE ON FUNCTION public.process_sales_processing_queue(integer) TO postgres;
GRANT EXECUTE ON FUNCTION public.process_sales_processing_queue(integer) TO service_role;
