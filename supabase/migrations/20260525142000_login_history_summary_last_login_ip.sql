-- Extend get_login_history_by_email: add last login timestamp and IP per email.

DROP FUNCTION IF EXISTS public.get_login_history_by_email();

CREATE OR REPLACE FUNCTION public.get_login_history_by_email()
RETURNS TABLE(
  email text,
  logins bigint,
  last_login_at timestamptz,
  last_ip_address text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    lh.email,
    count(*)::bigint AS logins,
    max(lh.login_at) AS last_login_at,
    (array_agg(lh.ip_address ORDER BY lh.login_at DESC NULLS LAST))[1] AS last_ip_address
  FROM public.login_history lh
  WHERE public.get_my_role() = 'admin'
  GROUP BY lh.email
  ORDER BY logins DESC;
$$;

COMMENT ON FUNCTION public.get_login_history_by_email() IS
  'Returns login counts, last login time, and last IP per email for admins (Login history summary tab).';

GRANT EXECUTE ON FUNCTION public.get_login_history_by_email() TO authenticated;
