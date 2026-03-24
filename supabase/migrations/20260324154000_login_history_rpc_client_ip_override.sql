CREATE OR REPLACE FUNCTION public.log_login_history(
  p_ip_address text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_timezone text DEFAULT NULL,
  p_isp text DEFAULT NULL,
  p_is_vpn boolean DEFAULT NULL,
  p_is_proxy boolean DEFAULT NULL,
  p_is_tor boolean DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_platform text DEFAULT NULL,
  p_browser_language text DEFAULT NULL,
  p_login_source text DEFAULT 'web'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_headers jsonb;
  v_ip text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  v_ip := NULLIF(TRIM(COALESCE(p_ip_address, '')), '');

  IF v_ip IS NULL THEN
    BEGIN
      v_headers := COALESCE(current_setting('request.headers', true), '{}')::jsonb;
    EXCEPTION
      WHEN OTHERS THEN
        v_headers := '{}'::jsonb;
    END;

    v_ip := NULLIF(split_part(COALESCE(v_headers->>'x-forwarded-for', ''), ',', 1), '');
    IF v_ip IS NULL THEN
      v_ip := NULLIF(v_headers->>'x-real-ip', '');
    END IF;
    IF v_ip IS NULL THEN
      v_ip := NULLIF(v_headers->>'cf-connecting-ip', '');
    END IF;
  END IF;

  INSERT INTO public.login_history (
    user_id,
    email,
    ip_address,
    city,
    region,
    country,
    timezone,
    isp,
    is_vpn,
    is_proxy,
    is_tor,
    user_agent,
    platform,
    browser_language,
    login_source
  )
  VALUES (
    auth.uid(),
    p_email,
    v_ip,
    p_city,
    p_region,
    p_country,
    p_timezone,
    p_isp,
    p_is_vpn,
    p_is_proxy,
    p_is_tor,
    p_user_agent,
    p_platform,
    p_browser_language,
    COALESCE(NULLIF(p_login_source, ''), 'web')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_login_history(
  text, text, text, text, text, text, text, boolean, boolean, boolean, text, text, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.log_login_history(
  text, text, text, text, text, text, text, boolean, boolean, boolean, text, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_login_history(
  text, text, text, text, text, text, text, boolean, boolean, boolean, text, text, text, text
) TO service_role;
