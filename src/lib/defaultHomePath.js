/** Default landing route after login (and for logo / home redirects). */
export function getDefaultHomePath(role) {
  return (role || 'viewer').toLowerCase() === 'viewer' ? '/inventory-report' : '/dashboard';
}
