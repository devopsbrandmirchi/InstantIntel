// Daily sales processing no longer runs in this Edge Function (it timed out).
// The job runs on a schedule via pg_cron and can be run manually from SQL Editor.
// This endpoint just returns instructions.

Deno.serve(async () => {
  return new Response(
    JSON.stringify({
      success: true,
      message:
        "Daily sales processing runs on schedule (pg_cron). To run now, run in SQL Editor: SELECT run_daily_sales_processing(); Then check: SELECT * FROM v_sales_processing_latest;",
      run_now_sql: "SELECT run_daily_sales_processing();",
      log_sql: "SELECT * FROM v_sales_processing_latest;",
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
