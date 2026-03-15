# Daily Sales Processing — Restart (No Edge Function, No Timeout)

The Edge Function kept hitting **"upstream request timeout"** because `run_daily_sales_processing()` takes longer than the request timeout. So we **stopped running the job from the Edge Function** and run it **only in the database** (on a schedule with pg_cron, or on demand from SQL Editor).

---

## What we did **not** remove

- **Tables:** `saleprocessedvins`, `sales_processing_log`, `inventorydata`, `clients` — unchanged.
- **Functions:** `process_dealer_sales`, `run_daily_sales_processing`, `get_saleprocessedvins_count`, `truncate_saleprocessedvins`, `get_daily_sales_current_month`, `get_daily_sales_by_customer` — still there for the app and for running the job.

So we did **not** remove “all sales related functions and tables”. We only removed the **trigger** that called the Edge Function via pg_net.

---

## What we removed

- **`trigger_daily_sales_processing`** — it called the Edge Function with `?action=process`, which always timed out. Dropped in the new migration.

---

## What we added

- **pg_cron job** `daily-sales-processing`: runs **`run_daily_sales_processing()`** every day at **02:00 UTC** (customize in the migration if you want another time).

---

## What you need to do

### 1. Run the new migration

In **Supabase Dashboard → SQL Editor**, run the contents of:

**`supabase/migrations/20260315000003_sales_processing_cron_only.sql`**

That will:

- Drop `trigger_daily_sales_processing`.
- Enable **pg_cron** (enable it in Dashboard → Database → Extensions if the migration fails).
- Schedule `run_daily_sales_processing()` daily at 02:00 UTC.

### 2. Enable pg_cron if needed

If the migration fails on `CREATE EXTENSION pg_cron`, enable it first:

- **Dashboard → Database → Extensions** → enable **pg_cron**.

Then run the migration again (or just the `cron.schedule` part if the extension is already enabled).

### 3. Run the job “now” (without waiting for the schedule)

In **SQL Editor**:

```sql
SELECT run_daily_sales_processing();
```

Wait until it finishes (can be several minutes). Then check the log:

```sql
SELECT * FROM v_sales_processing_latest;
```

### 4. (Optional) Redeploy the Edge Function

The Edge Function `daily-sales-processor-dealer-wise` no longer runs the job; it only returns a short message and the SQL to run manually. You can redeploy it from the repo so Postman gets that response instead of a timeout. You can also leave the old version; it will still timeout if something calls it and tries to run the job.

---

## Summary

| Before | After |
|--------|--------|
| Postman → Edge Function → trigger → pg_net → Edge Function `?action=process` → `run_daily_sales_processing()` → **timeout** | Job runs **in DB only**: on schedule (pg_cron) or via `SELECT run_daily_sales_processing();` in SQL Editor |
| Trigger + Edge Function | No trigger; pg_cron + optional “run now” in SQL Editor |

No tables or core sales logic were removed; only the failing trigger was dropped and the job was moved to cron + manual run.

---

## Job queue for 100+ dealers (optional)

If you have many active dealers, use the **job queue** so processing runs in batches instead of one long transaction.

**Migration:** `supabase/migrations/20260315000004_sales_processing_job_queue.sql`

- **Table** `sales_processing_queue`: one row per dealer per run_date (status: pending → running → success/error).
- **`enqueue_daily_sales_processing()`**: truncates `saleprocessedvins`, inserts one pending job per active client for today. Returns count enqueued.
- **`process_sales_processing_queue(batch_size)`**: processes up to `batch_size` pending jobs (calls `process_dealer_sales` for each). Returns number processed.

**Cron (in the migration):**

1. **daily-sales-enqueue** at 02:00: `SELECT enqueue_daily_sales_processing();`
2. **daily-sales-process-queue** every 2 min: `SELECT process_sales_processing_queue(1);` (one dealer per run; each dealer can have huge data).

So all active dealers are enqueued at 2am; every 2 minutes one dealer is processed. For 100 dealers, the queue is empty in ~3.3 hours. You can change frequency in the migration (e.g. `*/1 * * * *` for every 1 min).

**Manual run:**  
Enqueue now: `SELECT enqueue_daily_sales_processing();`  
Then either wait for cron or process batches: `SELECT process_sales_processing_queue(20);` (run multiple times until it returns 0).

**Status:** `SELECT * FROM sales_processing_queue WHERE run_date = CURRENT_DATE ORDER BY status, customer_id;`
