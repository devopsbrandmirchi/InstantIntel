import { requireAdmin } from '../_lib/requireAdmin.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const base = (process.env.SCRAPER_BRIDGE_URL || '').replace(/\/$/, '');
  const secret = process.env.SCRAPER_BRIDGE_SECRET;
  if (!base || !secret) {
    return res.status(503).json({
      error:
        'Scraper bridge not configured. Set SCRAPER_BRIDGE_URL and SCRAPER_BRIDGE_SECRET on Vercel (see infra/scraper-bridge).'
    });
  }

  try {
    const r = await fetch(`${base}/spiders`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(90000)
    });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(502).json({
        error: 'Invalid JSON from scraper bridge',
        detail: text.slice(0, 300)
      });
    }
    if (!r.ok) {
      return res.status(r.status >= 400 ? r.status : 502).json(data);
    }
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({
      error: e?.message || 'Scraper bridge unreachable. Check droplet, firewall, and SCRAPER_BRIDGE_URL.'
    });
  }
}
