import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/requestWithTimeout';

const REQUEST_TIMEOUT_MS = 20000;

const TABS = [
  { id: 'events', label: 'Recent events' },
  { id: 'summary', label: 'Logins per user' },
];

function escapeCsvCell(val) {
  const s = val == null ? '' : String(val);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const displayTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function formatDateTimeWithTimeZone(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZone: displayTimeZone,
    timeZoneName: 'short',
  }).format(d);
}

const LoginHistory = () => {
  const [activeTab, setActiveTab] = useState('events');
  const [rows, setRows] = useState([]);
  const [summaryRows, setSummaryRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState('');
  const [summaryError, setSummaryError] = useState('');

  const loadRows = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await withTimeout(
        supabase
          .from('login_history')
          .select('id, login_at, email, ip_address, city, region, country, timezone, isp, is_vpn, is_proxy, is_tor, user_agent')
          .order('login_at', { ascending: false })
          .limit(2000),
        REQUEST_TIMEOUT_MS,
      );
      if (queryError) throw queryError;
      setRows(data || []);
    } catch (e) {
      console.error(e);
      setRows([]);
      setError(e?.message || 'Failed to load login history.');
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const { data, error: rpcError } = await withTimeout(
        supabase.rpc('get_login_history_by_email'),
        REQUEST_TIMEOUT_MS,
      );
      if (rpcError) throw rpcError;
      setSummaryRows(data || []);
    } catch (e) {
      console.error(e);
      setSummaryRows([]);
      setSummaryError(e?.message || 'Failed to load login summary.');
    } finally {
      setSummaryLoading(false);
    }
  };

  const loadAll = async () => {
    await Promise.all([loadRows(), loadSummary()]);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const stats = useMemo(() => {
    const totalFromSummary = summaryRows.reduce((sum, r) => sum + (Number(r.logins) || 0), 0);
    const vpn = rows.filter((r) => r.is_vpn === true).length;
    const proxy = rows.filter((r) => r.is_proxy === true).length;
    const tor = rows.filter((r) => r.is_tor === true).length;
    return {
      total: totalFromSummary || rows.length,
      uniqueUsers: summaryRows.length,
      vpn,
      proxy,
      tor,
    };
  }, [rows, summaryRows]);

  const downloadEventsCsv = () => {
    const headers = [
      'id',
      'login_at',
      'email',
      'ip_address',
      'city',
      'region',
      'country',
      'timezone',
      'isp',
      'is_vpn',
      'is_proxy',
      'is_tor',
      'user_agent',
    ];
    const csvLines = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => escapeCsvCell(row[h])).join(',')),
    ];
    const csv = csvLines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'login-history-events.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSummaryCsv = () => {
    const headers = ['email', 'logins', 'last_login_at', 'last_ip_address', 'display_timezone'];
    const csvLines = [
      headers.join(','),
      ...summaryRows.map((row) =>
        [
          row.email,
          row.logins,
          row.last_login_at,
          row.last_ip_address,
          displayTimeZone,
        ]
          .map(escapeCsvCell)
          .join(','),
      ),
    ];
    const csv = csvLines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'login-history-by-user.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const isRefreshing = loading || summaryLoading;

  return (
    <div className="max-w-[100rem] mx-auto">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-slate-800 tracking-tight">Login history</h2>
        <p className="text-sm text-slate-500 mt-0.5">Track who logged in, from where, and possible VPN/proxy indicators.</p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-5">
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={loadAll}
            disabled={isRefreshing}
            className="px-3 py-2 text-sm rounded bg-slate-600 text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <i className={`fas ${isRefreshing ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`} />
            Refresh
          </button>
          {activeTab === 'events' ? (
            <button
              type="button"
              onClick={downloadEventsCsv}
              disabled={rows.length === 0}
              className="px-3 py-2 text-sm rounded bg-brand-navy text-white hover:bg-brand-navy-light disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <i className="fas fa-download" />
              Download CSV
            </button>
          ) : (
            <button
              type="button"
              onClick={downloadSummaryCsv}
              disabled={summaryRows.length === 0}
              className="px-3 py-2 text-sm rounded bg-brand-navy text-white hover:bg-brand-navy-light disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <i className="fas fa-download" />
              Download CSV
            </button>
          )}
        </div>
      </div>

      {(error || summaryError) && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {[error, summaryError].filter(Boolean).join(' ')}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total logins</p>
          <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">{stats.total.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Unique users</p>
          <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">{stats.uniqueUsers.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">VPN flagged</p>
          <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">{stats.vpn.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-1">Recent 2,000 events</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Proxy flagged</p>
          <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">{stats.proxy.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-1">Recent 2,000 events</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Tor flagged</p>
          <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">{stats.tor.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400 mt-1">Recent 2,000 events</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === id
                    ? 'bg-white text-brand-navy shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            {activeTab === 'events'
              ? 'Showing up to 2,000 most recent login events.'
              : `Counts from all rows in login_history. Last login times shown in ${displayTimeZone}.`}
          </p>
        </div>

        {activeTab === 'events' ? (
          loading ? (
            <div className="py-10 text-center text-slate-500 text-sm">
              <i className="fas fa-spinner fa-spin mr-2" />
              Loading login history...
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm">No login history found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#1e3a5f] text-white">
                  <tr>
                    <th className="px-3 py-2.5 text-left font-semibold">Date / Time</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Email</th>
                    <th className="px-3 py-2.5 text-left font-semibold">IP</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Location</th>
                    <th className="px-3 py-2.5 text-left font-semibold">VPN</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Proxy</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Tor</th>
                    <th className="px-3 py-2.5 text-left font-semibold">ISP</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={r.id} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                      <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{r.login_at || ''}</td>
                      <td className="px-3 py-2.5 text-slate-700">{r.email || ''}</td>
                      <td className="px-3 py-2.5 text-slate-700">{r.ip_address || ''}</td>
                      <td className="px-3 py-2.5 text-slate-700">
                        {[r.city, r.region, r.country].filter(Boolean).join(', ')}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{r.is_vpn === true ? 'Yes' : r.is_vpn === false ? 'No' : ''}</td>
                      <td className="px-3 py-2.5 text-slate-700">{r.is_proxy === true ? 'Yes' : r.is_proxy === false ? 'No' : ''}</td>
                      <td className="px-3 py-2.5 text-slate-700">{r.is_tor === true ? 'Yes' : r.is_tor === false ? 'No' : ''}</td>
                      <td className="px-3 py-2.5 text-slate-700">{r.isp || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : summaryLoading ? (
          <div className="py-10 text-center text-slate-500 text-sm">
            <i className="fas fa-spinner fa-spin mr-2" />
            Loading login summary...
          </div>
        ) : summaryRows.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-sm">No login history found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#1e3a5f] text-white">
                <tr>
                  <th className="px-3 py-2.5 text-left font-semibold w-12">#</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Email</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Logins</th>
                  <th className="px-3 py-2.5 text-left font-semibold">
                    Last login
                    <span className="block text-[10px] font-normal text-white/75 normal-case">
                      ({displayTimeZone})
                    </span>
                  </th>
                  <th className="px-3 py-2.5 text-left font-semibold">Last IP</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((r, idx) => (
                  <tr key={r.email || idx} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-2.5 text-slate-700">{r.email || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-800 text-right font-medium tabular-nums">
                      {Number(r.logins || 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                      {formatDateTimeWithTimeZone(r.last_login_at)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{r.last_ip_address || '—'}</td>
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

export default LoginHistory;
