import { requireAdmin } from '../_lib/requireAdmin.js';

const SAFE_SPIDER = /^[A-Za-z0-9_]+$/;
const ALLOWED_LOG = new Set(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']);

function readBody(req) {
  const b = req.body;
  if (b == null) return {};
  if (typeof b === 'object' && !Buffer.isBuffer(b)) return b;
  if (typeof b === 'string') {
    try {
      return JSON.parse(b);
    } catch {
      return {};
    }
  }
  return {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const body = readBody(req);
  const spider = typeof body.spider === 'string' ? body.spider.trim() : '';
  let logLevel = typeof body.logLevel === 'string' ? body.logLevel.trim().toUpperCase() : 'INFO';
  if (!ALLOWED_LOG.has(logLevel)) logLevel = 'INFO';

  if (!spider || !SAFE_SPIDER.test(spider)) {
    return res.status(400).json({
      error: 'Invalid spider name. Use only letters, numbers, and underscores (must match scrapy list).'
    });
  }

  const base = (process.env.SCRAPER_BRIDGE_URL || '').trim().replace(/\/$/, '');
  const secret = (process.env.SCRAPER_BRIDGE_SECRET || '').trim();
  if (!base || !secret) {
    return res.status(503).json({
      error:
        'Scraper bridge not configured. Set SCRAPER_BRIDGE_URL and SCRAPER_BRIDGE_SECRET on Vercel (see infra/scraper-bridge).'
    });
  }

  try {
    const r = await fetch(`${base}/crawl`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`
      },
      body: JSON.stringify({ spider, logLevel }),
      signal: AbortSignal.timeout(45000)
    });
    const data = await r.json().catch(() => ({}));
    const status = r.status === 202 || r.status === 200 ? 202 : r.status >= 400 ? r.status : 502;
    return res.status(status).json(data);
  } catch (e) {
    return res.status(502).json({
      error: e?.message || 'Scraper bridge unreachable. Check droplet and SCRAPER_BRIDGE_URL.'
    });
  }
}
