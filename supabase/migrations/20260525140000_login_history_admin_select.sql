-- Allow admins to read all login_history rows on /login-history.
-- Non-admin users keep login_history_select_own (own rows only).

DROP POLICY IF EXISTS login_history_select_admin ON public.login_history;

CREATE POLICY login_history_select_admin
ON public.login_history
FOR SELECT
TO authenticated
USING (public.get_my_role() = 'admin');
