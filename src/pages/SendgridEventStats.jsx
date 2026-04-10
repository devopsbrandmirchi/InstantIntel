import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/requestWithTimeout';

const REQUEST_TIMEOUT_MS = 20000;

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function escapeCsvCell(val) {
  const s = val == null ? '' : String(val);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const SendgridEventStats = () => {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return fmtDate(d);
  });
  const [dateTo, setDateTo] = useState(() => fmtDate(new Date()));
  const [eventFilter, setEventFilter] = useState('all');
  const [mcAutoNameFilter, setMcAutoNameFilter] = useState('all');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadRows = async () => {
    setLoading(true);
    setError('');
    try {
      let q = supabase
        .from('sendgrid_events')
        .select('id, entry_date, created_at, email, event, mc_auto_name, ip, url, sg_event_id, sg_message_id, template_id')
        .gte('entry_date', dateFrom)
        .lte('entry_date', dateTo)
        .order('entry_date', { ascending: false })
        .order('id', { ascending: false })
        .limit(5000);

      if (eventFilter !== 'all') q = q.eq('event', eventFilter);

      const { data, error: queryError } = await withTimeout(q, REQUEST_TIMEOUT_MS);
      if (queryError) throw queryError;
      setRows(data || []);
    } catch (e) {
      console.error(e);
      setRows([]);
      setError(e?.message || 'Failed to load SendGrid events.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, [dateFrom, dateTo, eventFilter]);

  const filteredRows = useMemo(() => {
    if (mcAutoNameFilter === 'all') return rows;
    return rows.filter((r) => {
      const v = (r.mc_auto_name || '').trim();
      if (mcAutoNameFilter === 'with_value') return v !== '';
      if (mcAutoNameFilter === 'blank') return v === '';
      return true;
    });
  }, [rows, mcAutoNameFilter]);

  const stats = useMemo(() => {
    let openCount = 0;
    let clickCount = 0;
    let otherCount = 0;
    let mcAutoNameWithValue = 0;
    let mcAutoNameBlank = 0;
    const uniqueMcAutoNames = new Set();
    filteredRows.forEach((r) => {
      const ev = (r.event || '').toLowerCase();
      if (ev === 'open') openCount += 1;
      else if (ev === 'click') clickCount += 1;
      else otherCount += 1;

      const mcName = (r.mc_auto_name || '').trim();
      if (mcName) {
        mcAutoNameWithValue += 1;
        uniqueMcAutoNames.add(mcName);
      } else mcAutoNameBlank += 1;
    });
    return {
      total: filteredRows.length,
      openCount,
      clickCount,
      otherCount,
      mcAutoNameWithValue,
      mcAutoNameBlank,
      uniqueMcAutoNameCount: uniqueMcAutoNames.size,
    };
  }, [filteredRows]);

  const dailySummary = useMemo(() => {
    const m = {};
    filteredRows.forEach((r) => {
      const d = r.entry_date || '';
      if (!d) return;
      if (!m[d]) m[d] = { date: d, total: 0, open: 0, click: 0 };
      m[d].total += 1;
      const ev = (r.event || '').toLowerCase();
      if (ev === 'open') m[d].open += 1;
      if (ev === 'click') m[d].click += 1;
    });
    return Object.values(m).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredRows]);

  const downloadCsv = () => {
    const headers = [
      'id',
      'entry_date',
      'created_at',
      'email',
      'event',
      'mc_auto_name',
      'ip',
      'url',
      'sg_event_id',
      'sg_message_id',
      'template_id',
    ];
    const csvLines = [
      headers.join(','),
      ...filteredRows.map((r) =>
        headers
          .map((h) => escapeCsvCell(r[h]))
          .join(','),
      ),
    ];
    const csv = csvLines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sendgrid-events-${dateFrom}-to-${dateTo}-${eventFilter}-${mcAutoNameFilter}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputClass = 'text-sm px-2 py-1.5 border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/60 bg-white';

  return (
    <div className="max-w-[100rem] mx-auto">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-slate-800 tracking-tight">SendGrid event statistics</h2>
        <p className="text-sm text-slate-500 mt-0.5">Default view shows the last 30 days. Filter by event, mc_auto_name presence, and export CSV.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Event</label>
            <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className={inputClass}>
              <option value="all">All events</option>
              <option value="open">Open</option>
              <option value="click">Click</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">mc_auto_name</label>
            <select value={mcAutoNameFilter} onChange={(e) => setMcAutoNameFilter(e.target.value)} className={inputClass}>
              <option value="all">All</option>
              <option value="with_value">With value</option>
              <option value="blank">Blank</option>
            </select>
          </div>
          <button
            type="button"
            onClick={loadRows}
            disabled={loading}
            className="px-3 py-2 text-sm rounded bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={filteredRows.length === 0}
            className="px-3 py-2 text-sm rounded bg-brand-navy text-white hover:bg-brand-navy-light disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <i className="fas fa-download" />
            Download CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total events</p>
          <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">{stats.total.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Open events</p>
          <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">{stats.openCount.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Click events</p>
          <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">{stats.clickCount.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Other events</p>
          <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">{stats.otherCount.toLocaleString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">mc_auto_name with value</p>
          <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">
            {stats.mcAutoNameWithValue.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {stats.total > 0 ? `${((stats.mcAutoNameWithValue / stats.total) * 100).toFixed(1)}%` : '0.0%'} of filtered events
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">mc_auto_name blank</p>
          <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">
            {stats.mcAutoNameBlank.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {stats.total > 0 ? `${((stats.mcAutoNameBlank / stats.total) * 100).toFixed(1)}%` : '0.0%'} of filtered events
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Unique mc_auto_name</p>
          <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">
            {stats.uniqueMcAutoNameCount.toLocaleString()}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Distinct non-empty values in the current filters (same rows as the table below, up to 5,000 loaded).
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-5">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80">
          <h3 className="text-sm font-semibold text-slate-700">Daily summary</h3>
        </div>
        {loading ? (
          <div className="py-10 text-center text-slate-500 text-sm">
            <i className="fas fa-spinner fa-spin mr-2" />
            Loading statistics...
          </div>
        ) : dailySummary.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-sm">No events found for selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1e3a5f] text-white">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold">Date</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Open</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Click</th>
                </tr>
              </thead>
              <tbody>
                {dailySummary.map((d, idx) => (
                  <tr key={d.date} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                    <td className="px-4 py-2.5 text-slate-700">{d.date}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{d.total.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{d.open.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">{d.click.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80">
          <h3 className="text-sm font-semibold text-slate-700">Event listing</h3>
        </div>
        {loading ? (
          <div className="py-10 text-center text-slate-500 text-sm">
            <i className="fas fa-spinner fa-spin mr-2" />
            Loading events...
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-sm">No events found for selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1e3a5f] text-white">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold">Entry Date</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Event</th>
                  <th className="px-3 py-2.5 text-left font-semibold">mc_auto_name</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Email</th>
                  <th className="px-3 py-2.5 text-left font-semibold">IP</th>
                  <th className="px-3 py-2.5 text-left font-semibold">URL</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Message ID</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r, idx) => (
                  <tr key={r.id} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{r.entry_date || ''}</td>
                    <td className="px-3 py-2.5 text-slate-700">{r.event || ''}</td>
                    <td className="px-3 py-2.5 text-slate-700">{r.mc_auto_name || ''}</td>
                    <td className="px-3 py-2.5 text-slate-700">{r.email || ''}</td>
                    <td className="px-3 py-2.5 text-slate-700">{r.ip || ''}</td>
                    <td className="px-3 py-2.5 text-slate-700 max-w-[360px] truncate" title={r.url || ''}>{r.url || ''}</td>
                    <td className="px-3 py-2.5 text-slate-700">{r.sg_message_id || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SendgridEventStats;
