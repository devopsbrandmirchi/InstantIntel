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

  const payload = {
    user_id: userId,
    email: email || '',
    ip_address: geo?.ip || null,
    city: geo?.city || null,
    region: geo?.region || null,
    country: geo?.country || null,
    timezone: geo?.timezone?.id || geo?.timezone || null,
    isp: geo?.connection?.isp || geo?.isp || null,
    is_vpn: typeof security.vpn === 'boolean' ? security.vpn : null,
    is_proxy: typeof security.proxy === 'boolean' ? security.proxy : null,
    is_tor: typeof security.tor === 'boolean' ? security.tor : null,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    platform: safeNavigatorValue('platform', ''),
    browser_language: safeNavigatorValue('language', ''),
    login_source: 'web',
  };

  // Non-blocking behavior at caller; errors are swallowed here.
  try {
    await supabase.from('login_history').insert(payload);
  } catch (_) {
    // ignore logging errors so user login is never blocked
  }
}
