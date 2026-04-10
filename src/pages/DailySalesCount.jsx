import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const TAB_LIST = 'list';
const TAB_GRID = 'grid';

function escapeCsvCell(val) {
  const s = val == null ? '' : String(val);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Local YYYY-MM-DD for daily-sales columns (matches DB date keys). */
function formatLocalYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function last30LocalDates() {
  const arr = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    arr.push(formatLocalYmd(d));
  }
  return arr;
}

const DailySalesCount = () => {
  const { currentUser } = useAuth();
  const isAdmin = (currentUser?.role || '').toLowerCase() === 'admin';
  const isRestrictedByAssignment = !isAdmin;
  const assignedClientIds = useMemo(
    () => (Array.isArray(currentUser?.assignedClientIds) ? currentUser.assignedClientIds.map(Number).filter(Number.isFinite) : []),
    [currentUser?.assignedClientIds]
  );
  const [counts, setCounts] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [sortBy, setSortBy] = useState('sold_date');
  const [sortDesc, setSortDesc] = useState(true);
  const [activeTab, setActiveTab] = useState(TAB_LIST);
  const [gridSearch, setGridSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      let countQ = supabase.from('sales_daily_count').select('id, customer_id, sold_date, sale_count');
      let clientsQ = supabase.from('clients').select('id, full_name').eq('is_active', true);
      if (isRestrictedByAssignment) {
        if (assignedClientIds.length === 0) {
          setCounts([]);
          setClients([]);
          setLoading(false);
          return;
        }
        countQ = countQ.in('customer_id', assignedClientIds);
        clientsQ = clientsQ.in('id', assignedClientIds);
      }
      const [countRes, clientsRes] = await Promise.all([
        countQ.order('sold_date', { ascending: false }),
        clientsQ.order('full_name'),
      ]);
      if (countRes.error) throw countRes.error;
      if (clientsRes.error) throw clientsRes.error;
      setCounts(countRes.data || []);
      setClients(clientsRes.data || []);
      if (!selectedClientId && (clientsRes.data || []).length > 0) setSelectedClientId('');
    } catch (err) {
      console.error('Daily sales count load error:', err);
      setError(err?.message || 'Failed to load daily sales count.');
      setCounts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser?.id, isRestrictedByAssignment, assignedClientIds.join(',')]);

  const clientsMap = useMemo(() => Object.fromEntries((clients || []).map((c) => [c.id, c.full_name || `Client #${c.id}`])), [clients]);

  const filtered = useMemo(() => {
    let list = [...(counts || [])];
    if (selectedClientId) list = list.filter((r) => String(r.customer_id) === String(selectedClientId));
    const key = sortBy === 'client' ? 'customer_id' : sortBy === 'sale_count' ? 'sale_count' : 'sold_date';
    list.sort((a, b) => {
      const va =
        key === 'sold_date'
          ? (a.sold_date || '')
          : key === 'sale_count'
            ? Number(a.sale_count) || 0
            : (clientsMap[a.customer_id] || '').localeCompare(clientsMap[b.customer_id] || '');
      const vb =
        key === 'sold_date'
          ? (b.sold_date || '')
          : key === 'sale_count'
            ? Number(b.sale_count) || 0
            : (clientsMap[b.customer_id] || '').localeCompare(clientsMap[a.customer_id] || '');
      if (key === 'sale_count') return sortDesc ? vb - va : va - vb;
      if (key === 'sold_date') return sortDesc ? (vb > va ? 1 : -1) : (va > vb ? 1 : -1);
      return sortDesc ? (vb > va ? 1 : -1) : (va > vb ? 1 : -1);
    });
    return list;
  }, [counts, selectedClientId, sortBy, sortDesc, clientsMap]);

  const summary = useMemo(() => {
    const total = filtered.reduce((acc, r) => acc + (Number(r.sale_count) || 0), 0);
    const byClient = filtered.reduce((acc, r) => {
      const id = r.customer_id;
      if (!acc[id]) acc[id] = { count: 0, days: 0 };
      acc[id].count += Number(r.sale_count) || 0;
      acc[id].days += 1;
      return acc;
    }, {});
    const clientCount = Object.keys(byClient).length;
    const recordCount = filtered.length;
    const activeClientsInScope = (clients || []).length;
    return { total, clientCount, recordCount, activeClientsInScope };
  }, [filtered, clients]);

  // Grid view: pivot (client rows × date columns)
  const gridLookup = useMemo(() => {
    const map = {};
    (counts || []).forEach((r) => {
      const key = `${r.customer_id}\t${r.sold_date}`;
      map[key] = Number(r.sale_count) || 0;
    });
    return map;
  }, [counts]);
  /** Always show the rolling last 30 local days so every active client has a row (— where no sales). */
  const gridDates = useMemo(() => last30LocalDates(), [loading]);
  const gridClients = useMemo(() => {
    const q = (gridSearch || '').trim().toLowerCase();
    return (clients || [])
      .map((c) => ({ id: c.id, name: c.full_name || `Client #${c.id}` }))
      .filter(({ name }) => !q || name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, gridSearch]);
  const getGridCount = (customerId, soldDate) => gridLookup[`${customerId}\t${soldDate}`] ?? null;

  const handleSort = (field) => {
    if (sortBy === field) setSortDesc((d) => !d);
    else setSortBy(field);
  };

  const downloadCsv = () => {
    const headers = ['customer_id', 'client_name', 'sold_date', 'sale_count'];
    const rows = filtered.map((r) => ({
      customer_id: r.customer_id,
      client_name: clientsMap[r.customer_id] ?? '',
      sold_date: r.sold_date,
      sale_count: r.sale_count,
    }));
    const csvLines = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => escapeCsvCell(r[h])).join(',')),
    ];
    const csv = csvLines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily-sales-count${selectedClientId ? `-client-${selectedClientId}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-800 tracking-tight">Daily Sales Count</h2>
        <p className="text-sm text-slate-500 mt-0.5">Sales count per active client by sold date (last 30 days).</p>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3">
          <i className="fas fa-exclamation-circle text-red-500 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-800">{error}</p>
            <button type="button" onClick={loadData} className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium underline">
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Active clients</p>
          </div>
          <div className="px-4 py-4">
            <p className="text-2xl font-semibold text-slate-800 tabular-nums">{summary.activeClientsInScope}</p>
            <p className="text-xs text-slate-500 mt-1">
              {isRestrictedByAssignment ? 'Assigned to you (active)' : 'Active in Client Master'}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total sales</p>
          </div>
          <div className="px-4 py-4">
            <p className="text-2xl font-semibold text-slate-800 tabular-nums">{(summary.total || 0).toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">Across all shown records</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Clients w/ sales</p>
          </div>
          <div className="px-4 py-4">
            <p className="text-2xl font-semibold text-slate-800 tabular-nums">{summary.clientCount}</p>
            <p className="text-xs text-slate-500 mt-1">With sales in list filter</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Records</p>
          </div>
          <div className="px-4 py-4">
            <p className="text-2xl font-semibold text-slate-800 tabular-nums">{summary.recordCount}</p>
            <p className="text-xs text-slate-500 mt-1">Date × client entries</p>
          </div>
        </div>
      </div>

      <div className="flex border-b border-slate-200 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab(TAB_LIST)}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
            activeTab === TAB_LIST
              ? 'border-slate-700 text-slate-800 bg-white border-slate-200'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          List view
        </button>
        <button
          type="button"
          onClick={() => setActiveTab(TAB_GRID)}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
            activeTab === TAB_GRID
              ? 'border-slate-700 text-slate-800 bg-white border-slate-200'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          Sales count
        </button>
      </div>

      {activeTab === TAB_LIST && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span className="font-medium">Client</span>
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-slate-400 focus:ring-1 focus:ring-slate-400 min-w-[180px]"
              >
                <option value="">All active clients</option>
                {(clients || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name || `Client #${c.id}`}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={downloadCsv}
              disabled={filtered.length === 0}
              className="text-sm text-brand-navy-light hover:text-brand-navy font-medium flex items-center gap-1.5 disabled:opacity-50"
            >
              <i className="fas fa-download" aria-hidden="true" />
              Download CSV
            </button>
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="ml-auto text-sm text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1.5 disabled:opacity-50"
            >
              <i className={`fas fa-sync-alt ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <i className="fas fa-spinner fa-spin text-2xl mb-3" aria-hidden="true" />
              <p className="text-sm font-medium">Loading…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <i className="fas fa-inbox text-4xl mb-3 opacity-50" aria-hidden="true" />
              <p className="text-sm font-medium">No records to show</p>
              <p className="text-xs mt-1">Ensure the daily sales processing job has run and saleprocessedvins has data.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="table">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80">
                    <th
                      className="px-4 py-3 text-left font-semibold text-slate-700 cursor-pointer hover:bg-slate-100/80 select-none"
                      onClick={() => handleSort('client')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Client
                        {sortBy === 'client' && <i className={`fas fa-caret-${sortDesc ? 'down' : 'up'} text-xs`} />}
                      </span>
                    </th>
                    <th
                      className="px-4 py-3 text-left font-semibold text-slate-700 cursor-pointer hover:bg-slate-100/80 select-none"
                      onClick={() => handleSort('sold_date')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Sold date
                        {sortBy === 'sold_date' && <i className={`fas fa-caret-${sortDesc ? 'down' : 'up'} text-xs`} />}
                      </span>
                    </th>
                    <th
                      className="px-4 py-3 text-right font-semibold text-slate-700 cursor-pointer hover:bg-slate-100/80 select-none"
                      onClick={() => handleSort('sale_count')}
                    >
                      <span className="inline-flex items-center gap-1">
                        Sales count
                        {sortBy === 'sale_count' && <i className={`fas fa-caret-${sortDesc ? 'down' : 'up'} text-xs`} />}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, idx) => (
                    <tr key={`${row.customer_id}-${row.sold_date}`} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                      <td className="px-4 py-2.5 text-slate-800">
                        <span className="font-medium text-slate-600">{row.customer_id}</span>
                        <span className="mx-1.5 text-slate-300">—</span>
                        <span>{clientsMap[row.customer_id] ?? '—'}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{row.sold_date || '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-800">{Number(row.sale_count || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === TAB_GRID && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <input
                type="search"
                value={gridSearch}
                onChange={(e) => setGridSearch(e.target.value)}
                placeholder="Filter clients…"
                className="w-full rounded-lg border border-slate-300 pl-3 pr-9 py-2 text-sm"
              />
              <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" aria-hidden />
            </div>
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="ml-auto text-sm text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1.5 disabled:opacity-50"
            >
              <i className={`fas fa-sync-alt ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500">
              <i className="fas fa-spinner fa-spin text-2xl mb-3" aria-hidden="true" />
              <p className="text-sm font-medium">Loading…</p>
            </div>
          ) : gridClients.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-sm">
              {isRestrictedByAssignment
                ? 'No assigned active clients, or none found.'
                : 'No active clients found.'}
            </div>
          ) : (
            <div className="max-h-[min(70vh,40rem)] overflow-auto overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[#1e3a5f] text-white">
                    <th className="px-4 py-3 text-left font-semibold whitespace-nowrap sticky left-0 bg-[#1e3a5f] z-10 min-w-[240px]">
                      Client
                    </th>
                    {gridDates.map((d) => (
                      <th key={d} className="px-2 py-3 text-center font-semibold whitespace-nowrap min-w-[96px]">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gridClients.map(({ id, name }, idx) => (
                    <tr key={id} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}`}>
                      <td
                        className={`px-4 py-2.5 sticky left-0 z-[1] border-r border-slate-100 ${
                          idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'
                        }`}
                      >
                        <div className="font-medium text-slate-800">{name}</div>
                        <div className="text-xs text-slate-500 mt-0.5">Client ID: {id}</div>
                      </td>
                      {gridDates.map((d) => {
                        const n = getGridCount(id, d);
                        return (
                          <td key={d} className="px-2 py-2.5 text-center tabular-nums border-l border-slate-50 text-slate-700">
                            {n != null ? n.toLocaleString() : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DailySalesCount;

