-- Remove unused function (we use run_daily_sales_processing + process_dealer_sales instead)
DROP FUNCTION IF EXISTS public.process_all_dealer_sales();
