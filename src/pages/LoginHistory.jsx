import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/requestWithTimeout';

const REQUEST_TIMEOUT_MS = 20000;

function escapeCsvCell(val) {
  const s = val == null ? '' : String(val);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const LoginHistory = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  useEffect(() => {
    loadRows();
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const vpn = rows.filter((r) => r.is_vpn === true).length;
    const proxy = rows.filter((r) => r.is_proxy === true).length;
    const tor = rows.filter((r) => r.is_tor === true).length;
    return { total, vpn, proxy, tor };
  }, [rows]);

  const downloadCsv = () => {
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
    a.download = 'login-history.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

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
            disabled={rows.length === 0}
            className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total logins</p>
          <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">{stats.total.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">VPN flagged</p>
          <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">{stats.vpn.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Proxy flagged</p>
          <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">{stats.proxy.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Tor flagged</p>
          <p className="text-2xl font-semibold text-slate-800 tabular-nums mt-1">{stats.tor.toLocaleString()}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80">
          <h3 className="text-sm font-semibold text-slate-700">Recent login events</h3>
        </div>
        {loading ? (
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
        )}
      </div>
    </div>
  );
};

export default LoginHistory;
