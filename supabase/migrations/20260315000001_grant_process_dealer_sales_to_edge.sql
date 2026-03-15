-- ============================================================
-- Allow Edge Functions (anon/service_role) to call process_dealer_sales
-- and related RPCs. Without these GRANTs, the Edge Function returns
-- permission denied when invoking the RPC.
-- ============================================================

GRANT EXECUTE ON FUNCTION public.process_dealer_sales(integer, date) TO anon;
GRANT EXECUTE ON FUNCTION public.process_dealer_sales(integer, date) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_saleprocessedvins_count() TO anon;
GRANT EXECUTE ON FUNCTION public.get_saleprocessedvins_count() TO service_role;

GRANT EXECUTE ON FUNCTION public.truncate_saleprocessedvins() TO anon;
GRANT EXECUTE ON FUNCTION public.truncate_saleprocessedvins() TO service_role;
