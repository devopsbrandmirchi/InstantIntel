# daily-sales-processor-dealer-wise

## What it does

- **Default (trigger)**: When you call the function **without** `?action=process`, it calls the DB function `trigger_daily_sales_processing(supabase_url, service_key)`, which uses **pg_net** to queue an HTTP POST to this same Edge Function with `?action=process`. It returns immediately; the actual processing runs in the background.
- **Process**: When called with **`?action=process`** (e.g. by pg_net), it runs `run_daily_sales_processing()` in the DB (TRUNCATE saleprocessedvins, then `process_dealer_sales` for each active client).

## Why Postman didn’t process sales

1. **Trigger must call the process URL**  
   The DB function `trigger_daily_sales_processing` must use **pg_net** to POST to  
   `https://<project>.supabase.co/functions/v1/daily-sales-processor-dealer-wise?action=process`  
   with header `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>`.  
   If that DB function didn’t do this (or pg_net wasn’t set up), the “process” step never ran.

2. **RPC permissions**  
   `run_daily_sales_processing` and `trigger_daily_sales_processing` need  
   `GRANT EXECUTE ... TO service_role` (and optionally `anon`) so the Edge Function can call them.

3. **pg_net extension**  
   Enable **pg_net** in Supabase: Dashboard → Database → Extensions → enable **pg_net**.

## Postman

- **URL**: `https://paifqtwkewuqszvqcuam.supabase.co/functions/v1/daily-sales-processor-dealer-wise`  
  (optional: add `?action=process` only if you want to run processing **synchronously** in the same request; usually you use the default trigger.)
- **Method**: GET or POST.
- **Headers**:
  - `Authorization: Bearer <your-anon-key-or-service-role-key>`  
    (anon key is enough for the default trigger; service role is used inside the Edge Function and by pg_net for the process call.)

You should get a quick JSON response like “Processing triggered in background…”. Then check progress with:

```sql
SELECT * FROM v_sales_processing_latest;
-- or
SELECT * FROM sales_processing_log ORDER BY id DESC LIMIT 50;
```
