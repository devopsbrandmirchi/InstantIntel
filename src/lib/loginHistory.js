import { supabase } from './supabase';

const GEO_TIMEOUT_MS = 6000;

function withTimeoutSignal(ms = GEO_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, timer };
}

async function fetchGeoData() {
  const { controller, timer } = withTimeoutSignal();
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

function boolOrNull(v) {
  return typeof v === 'boolean' ? v : null;
}

function ispLooksLikeVpn(isp) {
  const s = (isp || '').toLowerCase();
  if (!s) return false;
  const keywords = [
    'vpn', 'proxy', 'datacenter', 'data center', 'hosting',
    'nordvpn', 'expressvpn', 'surfshark', 'proton', 'mullvad', 'ipvanish', 'tunnelbear',
    'digitalocean', 'linode', 'vultr', 'ovh', 'hetzner', 'cloudflare', 'amazon', 'aws',
    'google cloud', 'microsoft azure'
  ];
  return keywords.some((k) => s.includes(k));
}

async function fetchIpApiIsSecurity(ip) {
  if (!ip) return {};
  const { controller, timer } = withTimeoutSignal();
  try {
    const res = await fetch(`https://api.ipapi.is/?q=${encodeURIComponent(ip)}`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!res.ok) return {};
    const data = await res.json();
    const isVpn = boolOrNull(data?.is_vpn ?? data?.security?.is_vpn);
    const isProxy = boolOrNull(data?.is_proxy ?? data?.security?.is_proxy);
    const isTor = boolOrNull(data?.is_tor ?? data?.security?.is_tor);
    return { isVpn, isProxy, isTor };
  } catch (_) {
    return {};
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
  const ip = geo?.ip || null;
  const isp = geo?.connection?.isp || geo?.isp || null;

  let isVpn = boolOrNull(security.vpn);
  let isProxy = boolOrNull(security.proxy);
  let isTor = boolOrNull(security.tor);

  if (isVpn === null || isProxy === null || isTor === null) {
    const secondary = await fetchIpApiIsSecurity(ip);
    if (isVpn === null) isVpn = boolOrNull(secondary.isVpn);
    if (isProxy === null) isProxy = boolOrNull(secondary.isProxy);
    if (isTor === null) isTor = boolOrNull(secondary.isTor);
  }

  // Final heuristic so the field is not blank when provider omits security.
  if (isVpn === null && ispLooksLikeVpn(isp)) {
    isVpn = true;
  }

  try {
    // IP is captured server-side from request headers in RPC.
    await supabase.rpc('log_login_history', {
      p_ip_address: ip,
      p_email: email || '',
      p_city: geo?.city || null,
      p_region: geo?.region || null,
      p_country: geo?.country || null,
      p_timezone: geo?.timezone?.id || geo?.timezone || null,
      p_isp: isp,
      p_is_vpn: isVpn,
      p_is_proxy: isProxy,
      p_is_tor: isTor,
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      p_platform: safeNavigatorValue('platform', ''),
      p_browser_language: safeNavigatorValue('language', ''),
      p_login_source: 'web',
    });
  } catch (_) {
    // ignore logging errors so user login is never blocked
  }
}
