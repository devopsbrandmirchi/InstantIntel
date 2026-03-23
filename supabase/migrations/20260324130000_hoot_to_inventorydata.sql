-- Transfer from hoot_inventory -> inventorydata (daily), similar to legacy Django job:
-- 1) Delete existing inventorydata rows for target date + eligible hoot clients
-- 2) Insert rows from hoot_inventory for same date + same client filter
--
-- Eligible clients:
--   is_active = true
--   active_pull = true
--   scrap_feed = false
--   inventory_api is not null/empty

CREATE OR REPLACE FUNCTION public.run_inventory_from_hoot(p_date date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted bigint := 0;
  v_inserted bigint := 0;
BEGIN
  IF p_date IS NULL THEN
    p_date := CURRENT_DATE;
  END IF;

  -- Step 1: delete existing inventorydata rows for selected dealers on p_date.
  DELETE FROM public.inventorydata i
  USING public.clients c
  WHERE i.customer_id = c.id
    AND i.pull_date = p_date
    AND (CASE WHEN c.is_active IS TRUE THEN 1 WHEN c.is_active IS FALSE THEN 0 ELSE (c.is_active::int) END) = 1
    AND (CASE WHEN c.active_pull IS TRUE THEN 1 WHEN c.active_pull IS FALSE THEN 0 ELSE COALESCE(c.active_pull::int, 0) END) = 1
    AND (CASE WHEN c.scrap_feed IS TRUE THEN 1 WHEN c.scrap_feed IS FALSE THEN 0 ELSE COALESCE(c.scrap_feed::int, 0) END) = 0
    AND COALESCE(TRIM(c.inventory_api), '') <> '';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Step 2: insert latest hoot rows for same date + dealers.
  INSERT INTO public.inventorydata (
    customer_id,
    pull_date,
    pull_date_time,
    "condition",
    year,
    make,
    model,
    vin,
    advertiser,
    color,
    description,
    doors,
    drivetrain,
    formatted_price,
    fuel_type,
    image_type,
    image_url,
    location,
    mileage,
    price,
    title,
    transmission,
    trim,
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
    custom_make,
    custom_type_2,
    custom_condition,
    custom_model,
    custom_trim
  )
  SELECT
    h.customer_id,
    h.pull_date,
    h.pull_date_time,
    LEFT(COALESCE(h."condition", '')::text, 255),
    LEFT(COALESCE(h.year, '')::text, 255),
    LEFT(COALESCE(h.make, '')::text, 255),
    LEFT(COALESCE(h.model, '')::text, 255),
    LEFT(COALESCE(TRIM(h.vin), '')::text, 255),
    LEFT(COALESCE(h.advertiser, '')::text, 255),
    LEFT(COALESCE(h.color, '')::text, 255),
    LEFT(COALESCE(h.description, '')::text, 255),
    LEFT(COALESCE(h.doors, '')::text, 255),
    LEFT(COALESCE(h.drivetrain, '')::text, 255),
    LEFT(COALESCE(h.formatted_price, '')::text, 255),
    LEFT(COALESCE(h.fuel_type, '')::text, 255),
    LEFT(COALESCE(h.image_type, '')::text, 255),
    LEFT(COALESCE(h.image_url, '')::text, 255),
    LEFT(COALESCE(h.location, '')::text, 255),
    LEFT(COALESCE(h.mileage, '')::text, 255),
    LEFT(COALESCE(h.price, '')::text, 255),
    LEFT(COALESCE(h.title, '')::text, 255),
    LEFT(COALESCE(h.transmission, '')::text, 255),
    LEFT(COALESCE(h.trim, '')::text, 255),
    LEFT(COALESCE(h.type, '')::text, 255),
    LEFT(COALESCE(NULLIF(TRIM(h.url), ''), '')::text, 255),
    LEFT(COALESCE(h.vehicle_type, '')::text, 255),
    LEFT(COALESCE(h.custom_label_0, '')::text, 255),
    LEFT(COALESCE(h.custom_label_1, '')::text, 255),
    LEFT(COALESCE(h.custom_label_2, '')::text, 255),
    LEFT(COALESCE(h.custom_label_3, '')::text, 255),
    LEFT(COALESCE(h.custom_label_4, '')::text, 255),
    LEFT(COALESCE(h.custom_type, '')::text, 255),
    LEFT(COALESCE(h.rv_type, '')::text, 255),
    LEFT(COALESCE(h.rv_category, '')::text, 255),
    LEFT(COALESCE(h.rv_class, '')::text, 255),
    LEFT(COALESCE(h.category, '')::text, 255),
    LEFT(COALESCE(h.motorhome_class, '')::text, 255),
    LEFT(COALESCE(h.custom_make, '')::text, 255),
    LEFT(COALESCE(h.custom_type_2, '')::text, 255),
    LEFT(COALESCE(h.custom_condition, '')::text, 255),
    LEFT(COALESCE(h.custom_model, '')::text, 255),
    LEFT(COALESCE(h.custom_trim, '')::text, 255)
  FROM public.hoot_inventory h
  INNER JOIN public.clients c
    ON c.id = h.customer_id
   AND (CASE WHEN c.is_active IS TRUE THEN 1 WHEN c.is_active IS FALSE THEN 0 ELSE (c.is_active::int) END) = 1
   AND (CASE WHEN c.active_pull IS TRUE THEN 1 WHEN c.active_pull IS FALSE THEN 0 ELSE COALESCE(c.active_pull::int, 0) END) = 1
   AND (CASE WHEN c.scrap_feed IS TRUE THEN 1 WHEN c.scrap_feed IS FALSE THEN 0 ELSE COALESCE(c.scrap_feed::int, 0) END) = 0
   AND COALESCE(TRIM(c.inventory_api), '') <> ''
  WHERE h.pull_date = p_date
  ON CONFLICT (customer_id, pull_date, vin, url) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'date', p_date,
    'rows_deleted', v_deleted,
    'rows_inserted', v_inserted,
    'status', 'ok'
  );
END;
$$;

COMMENT ON FUNCTION public.run_inventory_from_hoot(date) IS
  'Deletes and reloads inventorydata from hoot_inventory for target date. Includes only clients: is_active=1, active_pull=1, scrap_feed=0, inventory_api non-empty.';

GRANT EXECUTE ON FUNCTION public.run_inventory_from_hoot(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_inventory_from_hoot(date) TO postgres;
