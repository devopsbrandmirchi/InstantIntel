/**
 * URL Supabase redirects to after the password-reset email link is opened.
 * Production: set VITE_AUTH_REDIRECT_URL on Vercel and redeploy (see docs/password-reset-urls.md).
 */
export function getPasswordResetRedirectUrl() {
  const configured = import.meta.env.VITE_AUTH_REDIRECT_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }

  const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '';
  const path = basePath ? `${basePath}/login` : '/login';
  return `${window.location.origin}${path}`;
}
