import { supabase } from './supabase';

const GEO_TIMEOUT_MS = 6000;

async function fetchGeoData() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEO_TIMEOUT_MS);
  try {
    // ipwho.is returns city/country/IP and security flags (vpn/proxy/tor) without API key.
    const res = await fetch('https://ipwho.is/', {
      method: 'GET',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || data.success === false) return null;
    return data;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function safeNavigatorValue(key, fallback = '') {
  if (typeof navigator === 'undefined') return fallback;
  const value = navigator[key];
  return value == null ? fallback : String(value);
}

export async function recordLoginHistory({ userId, email }) {
  if (!userId) return;

  const geo = await fetchGeoData();
  const security = geo?.security || {};

  try {
    // IP is captured server-side from request headers in RPC.
    await supabase.rpc('log_login_history', {
      p_email: email || '',
      p_city: geo?.city || null,
      p_region: geo?.region || null,
      p_country: geo?.country || null,
      p_timezone: geo?.timezone?.id || geo?.timezone || null,
      p_isp: geo?.connection?.isp || geo?.isp || null,
      p_is_vpn: typeof security.vpn === 'boolean' ? security.vpn : null,
      p_is_proxy: typeof security.proxy === 'boolean' ? security.proxy : null,
      p_is_tor: typeof security.tor === 'boolean' ? security.tor : null,
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      p_platform: safeNavigatorValue('platform', ''),
      p_browser_language: safeNavigatorValue('language', ''),
      p_login_source: 'web',
    });
  } catch (_) {
    // ignore logging errors so user login is never blocked
  }
}
