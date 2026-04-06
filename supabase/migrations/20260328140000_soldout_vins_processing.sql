-- ============================================================
-- Sold-out VIN pipeline (Django soldout_vins_for_today logic, one table)
-- Truncate soldoutvins, then for each is_active client, VINs whose
-- MAX(pull_date) < run_date get sold_date = last_pull_date + 1 day
-- and a snapshot row from latest inventory (no sale_tag / stag logic).
--
-- We do not create vinsolddates: soldoutvins already carries customer_id,
-- vin, sold_date, and update_date — same facts as Django's narrow table.
-- ============================================================

DROP TABLE IF EXISTS public.vinsolddates CASCADE;
DROP FUNCTION IF EXISTS public.truncate_vinsolddates_and_soldoutvins();

-- One dealer: populate soldoutvins only (caller must truncate or run full job first)
CREATE OR REPLACE FUNCTION public.process_dealer_soldout_vins(
  p_customer_id integer,
  p_todate      date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  IF p_todate IS NULL THEN
    p_todate := CURRENT_DATE;
  END IF;

  DROP TABLE IF EXISTS tmp_soldout_staging;
  CREATE TEMP TABLE tmp_soldout_staging ON COMMIT DROP AS
  WITH last_dates AS (
    SELECT LOWER(vin) AS lvin,
           MAX(pull_date) AS last_pull_date
    FROM   inventorydata
    WHERE  customer_id = p_customer_id
      AND  vin IS NOT NULL
      AND  vin <> ''
    GROUP  BY LOWER(vin)
    HAVING MAX(pull_date) < p_todate
  ),
  sold_vins AS (
    SELECT lvin,
           (last_pull_date + INTERVAL '1 day')::date AS sold_date
    FROM   last_dates
  ),
  latest_records AS (
    SELECT DISTINCT ON (LOWER(vin))
           LOWER(vin) AS lvin,
           customer_id,
           pull_date,
           pull_date_time,
           "condition",
           year,
           make,
           model,
           vin AS orig_vin,
           advertiser,
           location,
           price,
           trim,
           custom_make,
           custom_type_2,
           color,
           description,
           doors,
           drivetrain,
           formatted_price,
           fuel_type,
           image_type,
           image_url,
           mileage,
           title,
           transmission,
           type,
           url,
           vehicle_type,
           custom_label_0,
           custom_label_1,
           custom_label_2,
           custom_label_3,
           custom_label_4,
           custom_type,
           rv_type,
           rv_category,
           rv_class,
           category,
           motorhome_class,
           custom_condition,
           custom_model,
           custom_trim
    FROM   inventorydata
    WHERE  customer_id = p_customer_id
      AND  vin IS NOT NULL
      AND  vin <> ''
    ORDER  BY LOWER(vin), pull_date DESC
  )
  SELECT
    lr.customer_id,
    sv.sold_date,
    lr.pull_date,
    lr.pull_date_time,
    lr."condition",
    lr.year,
    lr.make,
    lr.model,
    lr.orig_vin,
    lr.advertiser,
    lr.location,
    lr.price,
    lr.trim,
    lr.custom_make,
    lr.custom_type_2,
    lr.color,
    lr.description,
    lr.doors,
    lr.drivetrain,
    lr.formatted_price,
    lr.fuel_type,
    lr.image_type,
    lr.image_url,
    lr.mileage,
    lr.title,
    lr.transmission,
    lr.type,
    lr.url,
    lr.vehicle_type,
    lr.custom_label_0,
    lr.custom_label_1,
    lr.custom_label_2,
    lr.custom_label_3,
    lr.custom_label_4,
    lr.custom_type,
    lr.rv_type,
    lr.rv_category,
    lr.rv_class,
    lr.category,
    lr.motorhome_class,
    lr.custom_condition,
    lr.custom_model,
    lr.custom_trim
  FROM   sold_vins sv
  JOIN   latest_records lr ON lr.lvin = sv.lvin;

  INSERT INTO public.soldoutvins (
    customer_id,
    sold_date,
    pull_date,
    "condition",
    year,
    make,
    model,
    vin,
    advertiser,
    location,
    price,
    trim,
    custom_make,
    custom_type_2,
    pull_date_time,
    color,
    description,
    doors,
    drivetrain,
    formatted_price,
    fuel_type,
    image_type,
    image_url,
    mileage,
    title,
    transmission,
    type,
    url,
    vehicle_type,
    custom_label_0,
    custom_label_1,
    custom_label_2,
    custom_label_3,
    custom_label_4,
    custom_type,
    rv_type,
    rv_category,
    rv_class,
    category,
    motorhome_class,
    custom_condition,
    custom_model,
    custom_trim,
    update_date
  )
  SELECT
    t.customer_id,
    t.sold_date,
    t.pull_date,
    t."condition",
    t.year,
    t.make,
    t.model,
    t.orig_vin,
    t.advertiser,
    t.location,
    LEFT(COALESCE(NULLIF(TRIM(t.price::text), ''), '0'), 255),
    t.trim,
    t.custom_make,
    t.custom_type_2,
    t.pull_date_time,
    t.color,
    t.description,
    t.doors,
    t.drivetrain,
    t.formatted_price,
    t.fuel_type,
    t.image_type,
    t.image_url,
    t.mileage,
    t.title,
    t.transmission,
    t."type",
    t.url,
    t.vehicle_type,
    t.custom_label_0,
    t.custom_label_1,
    t.custom_label_2,
    t.custom_label_3,
    t.custom_label_4,
    t.custom_type,
    t.rv_type,
    t.rv_category,
    t.rv_class,
    t.category,
    t.motorhome_class,
    t.custom_condition,
    t.custom_model,
    t.custom_trim,
    p_todate
  FROM   tmp_soldout_staging t;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.process_dealer_soldout_vins(integer, date) IS
  'VINs with last pull before p_todate → sold_date = next day; inserts soldoutvins for one customer.';

CREATE OR REPLACE FUNCTION public.truncate_soldoutvins()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  TRUNCATE TABLE public.soldoutvins;
END;
$$;

COMMENT ON FUNCTION public.truncate_soldoutvins() IS
  'TRUNCATE soldoutvins before a full sold-out rebuild.';

CREATE OR REPLACE FUNCTION public.run_soldout_vins_processing()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client   RECORD;
  v_rows     integer;
  v_total    bigint := 0;
  v_run_date date := CURRENT_DATE;
BEGIN
  PERFORM pg_catalog.set_config('statement_timeout', '0', true);

  TRUNCATE TABLE public.soldoutvins;

  FOR v_client IN
    SELECT c.id::integer AS id
    FROM   public.clients c
    WHERE  (
             CASE
               WHEN c.is_active IS TRUE  THEN 1
               WHEN c.is_active IS FALSE THEN 0
               ELSE COALESCE(c.is_active::integer, 0)
             END
           ) = 1
    ORDER  BY c.id
  LOOP
    v_rows := public.process_dealer_soldout_vins(v_client.id, v_run_date);
    v_total := v_total + v_rows;
  END LOOP;

  RETURN jsonb_build_object(
    'run_date', v_run_date,
    'rows_soldoutvins', v_total
  );
END;
$$;

COMMENT ON FUNCTION public.run_soldout_vins_processing() IS
  'Truncates soldoutvins, then process_dealer_soldout_vins for each active client.';

GRANT EXECUTE ON FUNCTION public.process_dealer_soldout_vins(integer, date) TO anon;
GRANT EXECUTE ON FUNCTION public.process_dealer_soldout_vins(integer, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_dealer_soldout_vins(integer, date) TO authenticated;

GRANT EXECUTE ON FUNCTION public.truncate_soldoutvins() TO anon;
GRANT EXECUTE ON FUNCTION public.truncate_soldoutvins() TO service_role;
GRANT EXECUTE ON FUNCTION public.truncate_soldoutvins() TO authenticated;

GRANT EXECUTE ON FUNCTION public.run_soldout_vins_processing() TO anon;
GRANT EXECUTE ON FUNCTION public.run_soldout_vins_processing() TO service_role;
GRANT EXECUTE ON FUNCTION public.run_soldout_vins_processing() TO authenticated;
