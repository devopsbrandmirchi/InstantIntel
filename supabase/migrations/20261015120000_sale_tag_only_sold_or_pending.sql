-- ============================================================
-- Only real sold / sale-pending tags drive sale dating.
-- Some dealer feeds put marketing text into sale_tag (e.g. Trailer Hitch RV:
-- "NO HIDDEN FEE'S! MANY EXTRAS INCLUDED!"), which previously turned whole
-- inventories into "sales" on the day the text first appeared.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_sale_marker_tag(p_tag text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_tag ~* '\m(sold|sale[[:space:]]*pending)\M', false)
$$;

COMMENT ON FUNCTION public.is_sale_marker_tag(text) IS
  'True when sale_tag is a real marker: "Sold", "SOLD!!!", "Sale Pending", "In Stock - Sale Pending", etc. (case-insensitive).';

CREATE OR REPLACE FUNCTION public.process_dealer_sales(
  p_customer_id integer,
  p_todate      date
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted      integer := 0;
  v_stag_inserted integer := 0;
  v_log_id        bigint;
BEGIN
  INSERT INTO public.process_dealer_sales_log (customer_id, run_date, status)
  VALUES (p_customer_id, p_todate, 'running')
  RETURNING id INTO v_log_id;

  PERFORM pg_catalog.set_config('statement_timeout', '600000', true);

  -- ── Step 1: Actually-sold VINs ────────────────────────────────────────────
  WITH last_dates AS (
    SELECT LOWER(vin) AS lvin, MAX(pull_date) AS last_pull_date
    FROM   inventorydata
    WHERE  customer_id = p_customer_id AND vin IS NOT NULL AND vin <> ''
    GROUP  BY LOWER(vin)
    HAVING MAX(pull_date) < p_todate
  ),
  stag_dates AS (
    SELECT LOWER(vin) AS lvin, MIN(pull_date) AS stag_first_date
    FROM   inventorydata
    WHERE  customer_id = p_customer_id AND vin IS NOT NULL AND vin <> ''
      AND  public.is_sale_marker_tag(sale_tag)
    GROUP  BY LOWER(vin)
  ),
  sold_vins AS (
    SELECT ld.lvin,
           (ld.last_pull_date + INTERVAL '1 day')::date AS sold_date,
           sd.stag_first_date
    FROM   last_dates ld
    LEFT JOIN stag_dates sd ON sd.lvin = ld.lvin
  ),
  latest_records AS (
    SELECT DISTINCT ON (LOWER(vin))
           id, LOWER(vin) AS lvin, customer_id, pull_date, pull_date_time,
           condition, year, model, vin AS orig_vin, advertiser, location,
           price, trim, custom_make, custom_type_2,
           color, description, doors, drivetrain, formatted_price, fuel_type,
           image_type, image_url, mileage, title, transmission, type, url,
           vehicle_type, custom_label_0, custom_label_1, custom_label_2,
           custom_label_3, custom_label_4, custom_type, rv_type, rv_category,
           rv_class, category, motorhome_class, custom_condition, sale_tag,
           custom_model, custom_trim
    FROM   inventorydata
    WHERE  customer_id = p_customer_id AND vin IS NOT NULL AND vin <> ''
    ORDER  BY LOWER(vin), pull_date DESC
  )
  INSERT INTO saleprocessedvins (
    customer_id, pull_date, pull_date_time, condition, year, model, vin,
    advertiser, location, price, trim, custom_make, custom_type_2,
    color, description, doors, drivetrain, formatted_price, fuel_type,
    image_type, image_url, mileage, title, transmission, type, url,
    vehicle_type, custom_label_0, custom_label_1, custom_label_2,
    custom_label_3, custom_label_4, custom_type, rv_type, rv_category,
    rv_class, category, motorhome_class, custom_condition, sale_tag,
    sold_date, stag_first_date, days_delay, final_sold_date,
    custom_model, custom_trim
  )
  SELECT
    lr.customer_id, lr.pull_date, lr.pull_date_time, lr.condition, lr.year, lr.model,
    lr.lvin AS vin, lr.advertiser, lr.location,
    COALESCE(NULLIF(TRIM(lr.price::text), ''), '0')::numeric, lr.trim,
    lr.custom_make, lr.custom_type_2, lr.color, lr.description, lr.doors, lr.drivetrain,
    lr.formatted_price, lr.fuel_type, lr.image_type, lr.image_url, lr.mileage,
    lr.title, lr.transmission, lr.type, lr.url, lr.vehicle_type,
    lr.custom_label_0, lr.custom_label_1, lr.custom_label_2,
    lr.custom_label_3, lr.custom_label_4,
    lr.custom_type, lr.rv_type, lr.rv_category, lr.rv_class, lr.category,
    lr.motorhome_class, lr.custom_condition, lr.sale_tag,
    sv.sold_date, sv.stag_first_date,
    CASE WHEN sv.stag_first_date IS NOT NULL THEN (sv.sold_date - sv.stag_first_date) ELSE 0 END,
    CASE WHEN sv.stag_first_date IS NOT NULL THEN LEAST(sv.sold_date, sv.stag_first_date) ELSE sv.sold_date END,
    lr.custom_model, lr.custom_trim
  FROM   sold_vins sv
  JOIN   latest_records lr ON lr.lvin = sv.lvin;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  UPDATE public.process_dealer_sales_log
  SET    step1_sold_count = v_inserted
  WHERE  id = v_log_id;

  -- ── Step 2: Sale-tag-only VINs ────────────────────────────────────────────
  WITH already_inserted AS (
    SELECT vin FROM saleprocessedvins WHERE customer_id = p_customer_id
  ),
  stag_today AS (
    SELECT DISTINCT ON (LOWER(vin))
           LOWER(vin) AS lvin, customer_id, pull_date, pull_date_time,
           condition, year, model, advertiser, location, price, trim,
           custom_make, custom_type_2, color, description, doors, drivetrain,
           formatted_price, fuel_type, image_type, image_url, mileage, title,
           transmission, type, url, vehicle_type,
           custom_label_0, custom_label_1, custom_label_2,
           custom_label_3, custom_label_4,
           custom_type, rv_type, rv_category, rv_class, category,
           motorhome_class, custom_condition, sale_tag, custom_model, custom_trim
    FROM   inventorydata
    WHERE  customer_id = p_customer_id AND pull_date = p_todate
      AND  vin IS NOT NULL AND vin <> '' AND public.is_sale_marker_tag(sale_tag)
      AND  LOWER(vin) NOT IN (SELECT vin FROM already_inserted)
    ORDER  BY LOWER(vin), pull_date DESC
  ),
  stag_first AS (
    SELECT LOWER(vin) AS lvin, MIN(pull_date) AS stag_first_date
    FROM   inventorydata
    WHERE  customer_id = p_customer_id AND public.is_sale_marker_tag(sale_tag)
    GROUP  BY LOWER(vin)
  )
  INSERT INTO saleprocessedvins (
    customer_id, pull_date, pull_date_time, condition, year, model, vin,
    advertiser, location, price, trim, custom_make, custom_type_2,
    color, description, doors, drivetrain, formatted_price, fuel_type,
    image_type, image_url, mileage, title, transmission, type, url,
    vehicle_type, custom_label_0, custom_label_1, custom_label_2,
    custom_label_3, custom_label_4, custom_type, rv_type, rv_category,
    rv_class, category, motorhome_class, custom_condition, sale_tag,
    sold_date, stag_first_date, days_delay, final_sold_date,
    custom_model, custom_trim
  )
  SELECT
    st.customer_id, st.pull_date, st.pull_date_time, st.condition, st.year, st.model,
    st.lvin AS vin, st.advertiser, st.location,
    COALESCE(NULLIF(TRIM(st.price::text), ''), '0')::numeric, st.trim,
    st.custom_make, st.custom_type_2, st.color, st.description, st.doors,
    st.drivetrain, st.formatted_price, st.fuel_type, st.image_type, st.image_url,
    st.mileage, st.title, st.transmission, st.type, st.url, st.vehicle_type,
    st.custom_label_0, st.custom_label_1, st.custom_label_2,
    st.custom_label_3, st.custom_label_4,
    st.custom_type, st.rv_type, st.rv_category, st.rv_class, st.category,
    st.motorhome_class, st.custom_condition, st.sale_tag,
    NULL::date, sf.stag_first_date, 0, sf.stag_first_date,
    st.custom_model, st.custom_trim
  FROM   stag_today st
  LEFT JOIN stag_first sf ON sf.lvin = st.lvin;

  GET DIAGNOSTICS v_stag_inserted = ROW_COUNT;
  v_inserted := v_inserted + v_stag_inserted;

  UPDATE public.process_dealer_sales_log
  SET    step2_stag_count = v_stag_inserted,
         rows_inserted    = v_inserted,
         status           = 'success',
         completed_at     = clock_timestamp()
  WHERE  id = v_log_id;

  RETURN v_inserted;
EXCEPTION
  WHEN OTHERS THEN
    UPDATE public.process_dealer_sales_log
    SET    status = 'error', error_message = SQLERRM, completed_at = clock_timestamp()
    WHERE  id = v_log_id;
    RAISE;
END;
$$;
