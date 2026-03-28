import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const LOG_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR'];

async function apiFetch(path, { method = 'GET', token, body } = {}) {
  const headers = {
    Authorization: `Bearer ${token}`
  };
  if (body != null) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || res.statusText };
  }
  if (!res.ok) {
    let msg = data.error;
    if (!msg && data.detail != null) {
      msg = typeof data.detail === 'string' ? data.detail : Array.isArray(data.detail) ? data.detail.map((d) => d.msg || d).join('; ') : String(data.detail);
    }
    const err = new Error(msg || res.statusText || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const ScraperControl = () => {
  const { getAuthToken } = useAuth();
  const [spiders, setSpiders] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState(null);
  const [selectedSpider, setSelectedSpider] = useState('');
  const [logLevel, setLogLevel] = useState('INFO');
  const [starting, setStarting] = useState(false);
  const [startMessage, setStartMessage] = useState(null);

  const loadSpiders = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setListError('Not signed in.');
      setLoadingList(false);
      return;
    }
    setLoadingList(true);
    setListError(null);
    try {
      const data = await apiFetch('/api/scraper/spiders', { token });
      const list = Array.isArray(data.spiders) ? data.spiders : [];
      setSpiders(list);
      setSelectedSpider((prev) => (list.includes(prev) ? prev : list[0] || ''));
    } catch (e) {
      setSpiders([]);
      setListError(e.message || 'Failed to load spiders');
    } finally {
      setLoadingList(false);
    }
  }, [getAuthToken]);

  useEffect(() => {
    loadSpiders();
  }, [loadSpiders]);

  const handleStart = async () => {
    const token = getAuthToken();
    if (!token || !selectedSpider) return;
    setStarting(true);
    setStartMessage(null);
    try {
      const data = await apiFetch('/api/scraper/crawl', {
        method: 'POST',
        token,
        body: { spider: selectedSpider, logLevel }
      });
      setStartMessage({
        type: 'ok',
        text: data.message || `Started “${data.spider}” (pid ${data.pid}). Data will appear in Supabase when the run finishes.`
      });
    } catch (e) {
      setStartMessage({
        type: 'err',
        text: e.message || 'Failed to start spider'
      });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-800 tracking-tight">Run Scrapy spider</h2>
        <p className="text-sm text-slate-500 mt-1">
          Starts a crawl on your DigitalOcean droplet in the background. Spiders write to Supabase; this app only
          triggers the run and lists spider names (same as <code className="text-xs bg-slate-100 px-1 rounded">scrapy list</code>
          ).
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Spider</label>
          {loadingList ? (
            <p className="text-sm text-slate-500 py-2">
              <i className="fas fa-spinner fa-spin mr-2" aria-hidden />
              Loading spider list…
            </p>
          ) : listError ? (
            <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {listError}
              <button
                type="button"
                onClick={loadSpiders}
                className="ml-2 text-red-800 underline text-xs"
              >
                Retry
              </button>
            </div>
          ) : spiders.length === 0 ? (
            <p className="text-sm text-slate-500">No spiders returned. Check the bridge and Scrapy project on the droplet.</p>
          ) : (
            <select
              value={selectedSpider}
              onChange={(e) => setSelectedSpider(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {spiders.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Log level</label>
          <select
            value={logLevel}
            onChange={(e) => setLogLevel(e.target.value)}
            className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {LOG_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleStart}
          disabled={starting || !selectedSpider || loadingList || !!listError}
          className="px-4 py-2.5 text-sm font-medium rounded-lg bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {starting ? (
            <>
              <i className="fas fa-spinner fa-spin" aria-hidden />
              Starting…
            </>
          ) : (
            <>
              <i className="fas fa-play" aria-hidden />
              Start spider
            </>
          )}
        </button>

        {startMessage && (
          <div
            className={`text-sm rounded-lg px-3 py-2 ${
              startMessage.type === 'ok'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                : 'bg-red-50 text-red-800 border border-red-100'
            }`}
          >
            {startMessage.text}
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 mt-4">
        Requires Vercel env <code className="bg-slate-100 px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code>,{' '}
        <code className="bg-slate-100 px-1 rounded">SCRAPER_BRIDGE_URL</code>, and{' '}
        <code className="bg-slate-100 px-1 rounded">SCRAPER_BRIDGE_SECRET</code>. Local Vite dev: use{' '}
        <code className="bg-slate-100 px-1 rounded">vercel dev</code> or proxy <code className="bg-slate-100 px-1 rounded">/api</code>{' '}
        to your deployment.
      </p>
    </div>
  );
};

export default ScraperControl;
