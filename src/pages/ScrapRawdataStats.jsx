import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import Modal from '../components/Modal';

/** Suggested systemd instance fragment for journalctl (must match how units are named on your server). */
function scrapyInstanceSlug(label) {
  if (!label || typeof label !== 'string') return 'InstanceName';
  const t = label.replace(/[^a-zA-Z0-9]+/g, '').slice(0, 48);
  return t || 'InstanceName';
}

function journalctlScrapyCommand(instanceSlug) {
  return `journalctl -u scrapy-spider@${instanceSlug}.service --since "today" --no-pager`;
}

function JournalLogModalBody({ command, instanceSlug, onCopy, copied }) {
  return (
    <div className="space-y-4 text-sm text-slate-700">
      <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-xs text-amber-950">
        <p className="font-medium text-amber-900">Logs are not shown in the browser</p>
        <p className="mt-1 text-amber-900/85">
          SSH into the machine where the Scrapy systemd unit runs, then paste the command below (or copy it with the button).
        </p>
      </div>
      {instanceSlug && (
        <p className="text-xs text-slate-500">
          Suggested instance slug: <code className="bg-slate-100 px-1 rounded">{instanceSlug}</code> — must match{' '}
          <code className="bg-slate-100 px-1 rounded">scrapy-spider@{instanceSlug}.service</code> on your host.
        </p>
      )}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Command</span>
          <button
            type="button"
            onClick={() => onCopy(command)}
            className="text-xs font-medium text-blue-700 hover:text-blue-900 flex items-center gap-1.5 px-2 py-1 rounded-md border border-blue-200 bg-blue-50 hover:bg-blue-100"
          >
            <i className="fas fa-copy" aria-hidden />
            {copied ? 'Copied!' : 'Copy command'}
          </button>
        </div>
        <pre className="text-xs bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all font-mono leading-relaxed">
          {command}
        </pre>
      </div>
      <details className="rounded-lg border border-slate-200 bg-slate-50/80 text-xs group">
        <summary className="cursor-pointer select-none px-3 py-2.5 font-medium text-slate-700 list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
          <i className="fas fa-chevron-right text-[10px] text-slate-400 transition-transform group-open:rotate-90" aria-hidden />
          More journalctl options
        </summary>
        <div className="px-3 pb-3 pt-0 space-y-2 text-slate-600 border-t border-slate-200/80">
          <p>
            <code className="bg-white px-1 rounded border border-slate-200">--since &quot;1 hour ago&quot;</code> — recent window
          </p>
          <p>
            <code className="bg-white px-1 rounded border border-slate-200">--since &quot;2026-03-28&quot;</code> — from a date
          </p>
          <p>
            <code className="bg-white px-1 rounded border border-slate-200">-f</code> — follow new log lines (live)
          </p>
          <p>
            List template instances:{' '}
            <code className="bg-white px-1 rounded border border-slate-200 text-[11px] break-all">
              systemctl list-units &apos;scrapy-spider@*.service&apos;
            </code>
          </p>
        </div>
      </details>
    </div>
  );
}

const ScrapRawdataStats = () => {
  const [rows, setRows] = useState([]);
  const [dateColumns, setDateColumns] = useState([]);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [metric, setMetric] = useState('rows'); // 'rows' | 'vins'
  const [activeTab, setActiveTab] = useState('stats'); // 'stats' | 'missing'
  const [journalModal, setJournalModal] = useState(null);
  const [journalCopied, setJournalCopied] = useState(false);

  const copyJournalCommand = useCallback(async (cmd) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setJournalCopied(true);
      window.setTimeout(() => setJournalCopied(false), 2200);
    } catch {
      setJournalCopied(false);
    }
  }, []);

  const openJournalModal = useCallback((payload) => {
    setJournalCopied(false);
    setJournalModal(payload);
  }, []);

  const closeJournalModal = useCallback(() => {
    setJournalModal(null);
    setJournalCopied(false);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, clientsRes] = await Promise.all([
        supabase.rpc('get_scrap_rawdata_stats_7d'),
        supabase.from('clients').select('id, full_name, dealership_name, scrap_feed').eq('is_active', true)
      ]);
      if (statsRes.error) throw statsRes.error;
      if (clientsRes.error) throw clientsRes.error;

      const payload = statsRes.data;
      if (payload && typeof payload === 'object' && !Array.isArray(payload) && payload.dates && payload.stats) {
        const dates = Array.isArray(payload.dates) ? payload.dates.map(String) : [];
        const stats = Array.isArray(payload.stats) ? payload.stats : [];
        setDateColumns(dates);
        setRows(stats);
        setRangeStart(String(payload.range_start || ''));
        setRangeEnd(String(payload.range_end || ''));
      } else if (Array.isArray(payload)) {
        setError(
          'Database function is outdated. Apply migration 20260317000011_scrap_rawdata_stats_7d_json.sql so statistics use exactly 7 days including today (server date).'
        );
        setRows([]);
        setDateColumns([]);
      } else {
        setRows([]);
        setDateColumns([]);
      }
      setClients(clientsRes.data || []);
    } catch (e) {
      console.error(e);
      setError(e?.message || 'Failed to load scrap statistics.');
      setRows([]);
      setDateColumns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const nameByDealership = useMemo(() => {
    const m = {};
    (clients || []).forEach((c) => {
      const dn = (c.dealership_name || '').trim();
      if (dn && !m[dn]) m[dn] = c.full_name || `Client #${c.id}`;
    });
    return m;
  }, [clients]);

  const dealerships = useMemo(() => {
    const set = new Set((rows || []).map((r) => r.dealership_name).filter(Boolean));
    const q = search.trim().toLowerCase();
    return Array.from(set)
      .filter((dn) => {
        if (!q) return true;
        const label = `${dn} ${nameByDealership[dn] || ''}`.toLowerCase();
        return label.includes(q);
      })
      .sort((a, b) => a.localeCompare(b));
  }, [rows, search, nameByDealership]);

  const lookup = useMemo(() => {
    const map = {};
    (rows || []).forEach((r) => {
      const d = String(r.stat_date || '').slice(0, 10);
      const key = `${r.dealership_name}\t${d}`;
      map[key] = {
        rows: Number(r.row_count) || 0,
        vins: Number(r.distinct_vin_count) || 0
      };
    });
    return map;
  }, [rows]);

  const totals = useMemo(() => {
    let totalRows = 0;
    let totalVins = 0;
    (rows || []).forEach((r) => {
      totalRows += Number(r.row_count) || 0;
      totalVins += Number(r.distinct_vin_count) || 0;
    });
    return { totalRows, totalVins, dealershipCount: dealerships.length };
  }, [rows, dealerships.length]);

  const cell = (dealership, dateStr) => {
    const v = lookup[`${dealership}\t${dateStr}`];
    if (!v) return null;
    return metric === 'rows' ? v.rows : v.vins;
  };

  const todayStr = rangeEnd;

  const hasScrapeTodayForDealership = useCallback(
    (dealershipNameTrimmed) => {
      if (!todayStr || !dealershipNameTrimmed) return false;
      const v = lookup[`${dealershipNameTrimmed}\t${todayStr}`];
      if (!v) return false;
      return (Number(v.rows) || 0) > 0 || (Number(v.vins) || 0) > 0;
    },
    [lookup, todayStr]
  );

  const scrapFeedMissingToday = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (clients || []).filter((c) => c.scrap_feed);
    const missing = list.filter((c) => {
      const dn = (c.dealership_name || '').trim();
      if (!dn) return true;
      return !hasScrapeTodayForDealership(dn);
    });
    return missing
      .filter((c) => {
        if (!q) return true;
        const blob = `${c.id} ${c.full_name || ''} ${c.dealership_name || ''}`.toLowerCase();
        return blob.includes(q);
      })
      .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || ''), undefined, { sensitivity: 'base' }));
  }, [clients, hasScrapeTodayForDealership, search]);

  return (
    <div className="max-w-[100rem] mx-auto">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-slate-800 tracking-tight">Scrap feed statistics</h2>
        <p className="text-sm text-slate-500 mt-0.5">
          <span className="font-medium text-slate-600">7 calendar days including today</span>
          {rangeStart && rangeEnd && (
            <span className="ml-1">
              ({rangeStart} → {rangeEnd}, by <code className="text-xs bg-slate-100 px-1 rounded">creation_date</code> — same as DB{' '}
              <code className="text-xs bg-slate-100 px-1 rounded">CURRENT_DATE</code>).
            </span>
          )}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Leftmost column is today when data exists; counts are rows / distinct VINs per dealership per day.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
          <p className="mt-2 text-xs text-red-600">
            Run <code className="bg-red-100 px-1 rounded">20260317000011_scrap_rawdata_stats_7d_json.sql</code> in Supabase SQL.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total rows (7d window)</p>
          <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">{totals.totalRows.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Distinct VIN tallies (sum per day×dealer)</p>
          <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">{totals.totalVins.toLocaleString()}</p>
          <p className="text-[11px] text-slate-400 mt-1">Sum of daily distinct VINs per dealership (not global unique).</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Dealerships (after filter)</p>
          <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">{totals.dealershipCount}</p>
        </div>
        <div className="bg-amber-50/80 rounded-xl border border-amber-200/80 shadow-sm p-4 sm:col-span-3">
          <p className="text-xs font-medium uppercase tracking-wider text-amber-900/80">Scrap feed ON — no rows today</p>
          <p className="text-2xl font-semibold text-amber-950 tabular-nums mt-1">{scrapFeedMissingToday.length}</p>
          <p className="text-[11px] text-amber-900/60 mt-1">
            Active clients with <code className="text-[10px] bg-amber-100/80 px-1 rounded">scrap_feed</code> and no scrap stats for{' '}
            {todayStr || 'today'} (includes missing <code className="text-[10px] bg-amber-100/80 px-1 rounded">dealership_name</code>).
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <button
          type="button"
          onClick={() => setActiveTab('stats')}
          className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
            activeTab === 'stats'
              ? 'bg-slate-700 text-white border-slate-700'
              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
          }`}
        >
          7-day statistics
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('missing')}
          className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
            activeTab === 'missing'
              ? 'bg-amber-800 text-white border-amber-800'
              : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
          }`}
        >
          Missing scrape today
          {scrapFeedMissingToday.length > 0 && (
            <span className="ml-2 tabular-nums opacity-90">({scrapFeedMissingToday.length})</span>
          )}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-3 bg-slate-50/80">
          <div className="flex rounded-lg border border-slate-300 p-0.5 bg-white">
            <button
              type="button"
              onClick={() => setMetric('rows')}
              disabled={activeTab !== 'stats'}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab !== 'stats'
                  ? 'text-slate-400 cursor-not-allowed'
                  : metric === 'rows'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Row counts
            </button>
            <button
              type="button"
              onClick={() => setMetric('vins')}
              disabled={activeTab !== 'stats'}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab !== 'stats'
                  ? 'text-slate-400 cursor-not-allowed'
                  : metric === 'vins'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Distinct VINs
            </button>
          </div>
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={activeTab === 'stats' ? 'Filter by dealership or client name…' : 'Filter missing list…'}
              className="w-full rounded-lg border border-slate-300 pl-3 pr-9 py-2 text-sm"
            />
            <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" aria-hidden />
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="ml-auto px-3 py-2 text-sm rounded-md bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`} aria-hidden />
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-500">
            <i className="fas fa-spinner fa-spin text-2xl mb-2" />
            <p className="text-sm">Loading statistics…</p>
          </div>
        ) : activeTab === 'missing' ? (
          !todayStr ? (
            <div className="py-16 text-center text-slate-500 text-sm">No “today” date from server yet. Refresh after stats load.</div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 text-sm text-slate-700 space-y-2">
                <p className="font-medium text-slate-800">Check Scrapy logs on the scrap server (SSH)</p>
                <p className="text-xs text-slate-600">
                  If spiders run under systemd template units such as{' '}
                  <code className="text-[11px] bg-white px-1 py-0.5 rounded border border-slate-200">scrapy-spider@INSTANCE.service</code>, use{' '}
                  <code className="text-[11px] bg-white px-1 py-0.5 rounded border border-slate-200">journalctl</code>. Replace{' '}
                  <code className="text-[11px] bg-white px-1 py-0.5 rounded border border-slate-200">INSTANCE</code> with the same instance name your
                  server uses (example below uses <span className="font-medium">Livingston</span>).
                </p>
                <button
                  type="button"
                  onClick={() =>
                    openJournalModal({
                      command: journalctlScrapyCommand('Livingston'),
                      title: 'Scrapy logs — example (Livingston)',
                      instanceSlug: 'Livingston'
                    })
                  }
                  className="w-full text-left rounded-lg border border-slate-300 bg-white hover:bg-slate-50 hover:border-slate-400 transition-colors p-3 group"
                >
                  <pre className="text-xs bg-slate-900 text-slate-100 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all font-mono pointer-events-none">
                    {journalctlScrapyCommand('Livingston')}
                  </pre>
                  <p className="text-[11px] text-blue-700 font-medium mt-2 flex items-center gap-1.5">
                    <i className="fas fa-external-link-alt text-[10px]" aria-hidden />
                    Click to open instructions &amp; copy command
                  </p>
                </button>
                <p className="text-[11px] text-slate-500">
                  Tip: use the modal for copy + expandable journalctl options. Unit name may differ on your hosts.
                </p>
              </div>
              {scrapFeedMissingToday.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-sm px-4">
                  All active clients with scrap feed enabled have at least one row or distinct VIN for{' '}
                  <span className="font-medium text-slate-700">{todayStr}</span>, or none are flagged for scrap.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-amber-900/90 text-white">
                        <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Client ID</th>
                        <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Client name</th>
                        <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Dealership name</th>
                        <th className="px-4 py-3 text-left font-semibold whitespace-nowrap">Why listed</th>
                        <th className="px-4 py-3 text-left font-semibold min-w-[11rem]">
                          Log command
                          <span className="block text-[10px] font-normal text-amber-100/90 normal-case mt-0.5">
                            Click to open SSH / journalctl instructions
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {scrapFeedMissingToday.map((c) => {
                        const dn = (c.dealership_name || '').trim();
                        const reason = !dn
                          ? 'No dealership name — cannot match scrap_rawdata.dealership_name'
                          : !lookup[`${dn}\t${todayStr}`]
                            ? `No scrap rows for ${todayStr} (creation_date window)`
                            : 'Zero rows and zero distinct VINs for today';
                        const slug = scrapyInstanceSlug(dn || c.full_name || '');
                        const cmd = journalctlScrapyCommand(slug);
                        return (
                          <tr key={c.id} className="hover:bg-amber-50/40">
                            <td className="px-4 py-2.5 tabular-nums text-slate-700">{c.id}</td>
                            <td className="px-4 py-2.5 text-slate-900 font-medium">{c.full_name || '—'}</td>
                            <td className="px-4 py-2.5 text-slate-700">{dn || '—'}</td>
                            <td className="px-4 py-2.5 text-slate-600 text-xs max-w-md">{reason}</td>
                            <td className="px-4 py-2.5 align-top max-w-xs">
                              <button
                                type="button"
                                aria-label="Open SSH and journalctl instructions; copy command"
                                onClick={() =>
                                  openJournalModal({
                                    command: cmd,
                                    title: `Scrapy logs — ${c.full_name || `Client #${c.id}`}`,
                                    instanceSlug: slug
                                  })
                                }
                                className="text-left w-full text-xs font-mono text-blue-700 hover:text-blue-900 hover:underline break-all rounded-md px-2 py-1.5 -mx-2 -my-1.5 border border-transparent hover:border-blue-200 hover:bg-blue-50/80 transition-colors"
                              >
                                {cmd}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )
        ) : dateColumns.length === 0 && !error ? (
          <div className="py-16 text-center text-slate-500 text-sm">No date range from server. Apply the latest migration.</div>
        ) : dealerships.length === 0 ? (
          <div className="py-16 text-center text-slate-500 text-sm">No scrap rows in this 7-day window, or no match for your filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#1e3a5f] text-white">
                  <th className="px-4 py-3 text-left font-semibold whitespace-nowrap sticky left-0 bg-[#1e3a5f] z-10 min-w-[220px]">
                    Dealership
                  </th>
                  {dateColumns.map((d) => (
                    <th key={d} className="px-2 py-3 text-center font-semibold whitespace-nowrap min-w-[96px]">
                      <div>{d}</div>
                      {todayStr && d === todayStr && (
                        <div className="text-[10px] font-normal text-amber-200 mt-0.5 uppercase tracking-wide">Today</div>
                      )}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-right font-semibold whitespace-nowrap bg-[#1a3454]">7d total</th>
                </tr>
              </thead>
              <tbody>
                {dealerships.map((dn, idx) => {
                  let rowSum = 0;
                  return (
                    <tr key={dn} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}>
                      <td
                        className={`px-4 py-2.5 align-top sticky left-0 z-[1] border-r border-slate-100 ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'
                        }`}
                      >
                        <div className="font-medium text-slate-800">{dn}</div>
                        {nameByDealership[dn] && (
                          <div className="text-xs text-slate-500 mt-0.5">Client: {nameByDealership[dn]}</div>
                        )}
                      </td>
                      {dateColumns.map((d) => {
                        const n = cell(dn, d);
                        if (n != null) rowSum += n;
                        const isToday = todayStr && d === todayStr;
                        return (
                          <td
                            key={d}
                            className={`px-2 py-2.5 text-center tabular-nums border-l border-slate-50 ${
                              isToday ? 'bg-amber-50/80 text-slate-800' : 'text-slate-700'
                            }`}
                          >
                            {n != null ? n.toLocaleString() : '—'}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums text-slate-800 bg-slate-50/50">
                        {rowSum.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={!!journalModal}
        onClose={closeJournalModal}
        title={journalModal?.title || 'journalctl'}
        size="lg"
      >
        {journalModal && (
          <JournalLogModalBody
            command={journalModal.command}
            instanceSlug={journalModal.instanceSlug}
            onCopy={copyJournalCommand}
            copied={journalCopied}
          />
        )}
      </Modal>
    </div>
  );
};

export default ScrapRawdataStats;
