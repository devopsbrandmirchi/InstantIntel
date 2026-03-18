import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

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

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [statsRes, clientsRes] = await Promise.all([
          supabase.rpc('get_scrap_rawdata_stats_7d'),
          supabase.from('clients').select('id, full_name, dealership_name').eq('is_active', true)
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
    };
    load();
  }, []);

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
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-3 bg-slate-50/80">
          <div className="flex rounded-lg border border-slate-300 p-0.5 bg-white">
            <button
              type="button"
              onClick={() => setMetric('rows')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                metric === 'rows' ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Row counts
            </button>
            <button
              type="button"
              onClick={() => setMetric('vins')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                metric === 'vins' ? 'bg-slate-700 text-white' : 'text-slate-600 hover:bg-slate-100'
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
              placeholder="Filter by dealership or client name…"
              className="w-full rounded-lg border border-slate-300 pl-3 pr-9 py-2 text-sm"
            />
            <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" aria-hidden />
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-500">
            <i className="fas fa-spinner fa-spin text-2xl mb-2" />
            <p className="text-sm">Loading statistics…</p>
          </div>
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
    </div>
  );
};

export default ScrapRawdataStats;
