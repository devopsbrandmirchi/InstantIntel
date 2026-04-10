import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { nextSelectedClientIdAfterLoad } from '../lib/reconcileReportClientSelection';

const TAB_LIST = 'list';
const TAB_GRID = 'grid';

const InventoryDailyCount = () => {
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
  const [sortBy, setSortBy] = useState('pull_date');
  const [sortDesc, setSortDesc] = useState(true);
  const [activeTab, setActiveTab] = useState(TAB_LIST);
  const [gridSearch, setGridSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      let countQ = supabase.from('inventory_daily_count').select('id, customer_id, pull_date, vin_count');
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
        countQ.order('pull_date', { ascending: false }),
        clientsQ.order('full_name')
      ]);
      if (countRes.error) throw countRes.error;
      if (clientsRes.error) throw clientsRes.error;
      const clientList = clientsRes.data || [];
      setCounts(countRes.data || []);
      setClients(clientList);
      setSelectedClientId((prev) => nextSelectedClientIdAfterLoad(clientList, prev, { allowAllClients: true }));
    } catch (err) {
      console.error('Inventory daily count load error:', err);
      setError(err?.message || 'Failed to load daily inventory count.');
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
    const key = sortBy === 'client' ? 'customer_id' : sortBy === 'vin_count' ? 'vin_count' : 'pull_date';
    list.sort((a, b) => {
      const va = key === 'pull_date' ? (a.pull_date || '') : key === 'vin_count' ? Number(a.vin_count) || 0 : (clientsMap[a.customer_id] || '').localeCompare(clientsMap[b.customer_id] || '');
      const vb = key === 'pull_date' ? (b.pull_date || '') : key === 'vin_count' ? Number(b.vin_count) || 0 : (clientsMap[b.customer_id] || '').localeCompare(clientsMap[a.customer_id] || '');
      if (key === 'vin_count') return sortDesc ? vb - va : va - vb;
      if (key === 'pull_date') return sortDesc ? (vb > va ? 1 : -1) : (va > vb ? 1 : -1);
      return sortDesc ? (vb > va ? 1 : -1) : (va > vb ? 1 : -1);
    });
    return list;
  }, [counts, selectedClientId, sortBy, sortDesc, clientsMap]);

  const summary = useMemo(() => {
    const total = filtered.reduce((acc, r) => acc + (Number(r.vin_count) || 0), 0);
    const byClient = filtered.reduce((acc, r) => {
      const id = r.customer_id;
      if (!acc[id]) acc[id] = { count: 0, days: 0 };
      acc[id].count += Number(r.vin_count) || 0;
      acc[id].days += 1;
      return acc;
    }, {});
    const clientCount = Object.keys(byClient).length;
    const recordCount = filtered.length;
    return { total, clientCount, recordCount };
  }, [filtered]);

  // Grid view: pivot (client rows × date columns), count lookup, search-filtered client list
  const gridLookup = useMemo(() => {
    const map = {};
    (counts || []).forEach((r) => {
      const key = `${r.customer_id}\t${r.pull_date}`;
      map[key] = Number(r.vin_count) || 0;
    });
    return map;
  }, [counts]);
  const gridDates = useMemo(() => {
    const set = new Set((counts || []).map((r) => r.pull_date).filter(Boolean));
    return Array.from(set).sort((a, b) => (b > a ? 1 : -1));
  }, [counts]);
  const gridClients = useMemo(() => {
    const ids = [...new Set((counts || []).map((r) => r.customer_id).filter((v) => v != null))];
    const q = (gridSearch || '').trim().toLowerCase();
    return ids
      .map((id) => ({ id, name: clientsMap[id] ?? `Client #${id}` }))
      .filter(({ name }) => !q || name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [counts, clientsMap, gridSearch]);
  const getGridCount = (customerId, pullDate) => gridLookup[`${customerId}\t${pullDate}`] ?? null;

  const handleSort = (field) => {
    if (sortBy === field) setSortDesc((d) => !d);
    else setSortBy(field);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-slate-800 tracking-tight">Daily Inventory Count</h2>
        <p className="text-sm text-slate-500 mt-0.5">VIN count per active client by date (last 30 days). Data refreshes daily.</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Total VINs</p>
          </div>
          <div className="px-4 py-4">
            <p className="text-2xl font-semibold text-slate-800 tabular-nums">{(summary.total || 0).toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">Across all shown records</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/80">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Clients</p>
          </div>
          <div className="px-4 py-4">
            <p className="text-2xl font-semibold text-slate-800 tabular-nums">{summary.clientCount}</p>
            <p className="text-xs text-slate-500 mt-1">With count data</p>
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

      {/* Tabs: List view | Inventory count (grid) */}
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
          Inventory count
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
            <p className="text-xs mt-1">Ensure the daily count job has run and there is inventory data.</p>
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
                    onClick={() => handleSort('pull_date')}
                  >
                    <span className="inline-flex items-center gap-1">
                      Date
                      {sortBy === 'pull_date' && <i className={`fas fa-caret-${sortDesc ? 'down' : 'up'} text-xs`} />}
                    </span>
                  </th>
                  <th
                    className="px-4 py-3 text-right font-semibold text-slate-700 cursor-pointer hover:bg-slate-100/80 select-none"
                    onClick={() => handleSort('vin_count')}
                  >
                    <span className="inline-flex items-center gap-1">
                      VIN count
                      {sortBy === 'vin_count' && <i className={`fas fa-caret-${sortDesc ? 'down' : 'up'} text-xs`} />}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, idx) => (
                  <tr
                    key={row.id}
                    className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                  >
                    <td className="px-4 py-2.5 text-slate-800">
                      <span className="font-medium text-slate-600">{row.customer_id}</span>
                      <span className="mx-1.5 text-slate-300">—</span>
                      <span>{clientsMap[row.customer_id] ?? '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{row.pull_date || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-800 tabular-nums">
                      {(Number(row.vin_count) || 0).toLocaleString()}
                    </td>
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
            <span className="text-slate-400 font-normal mr-1">|</span>
            <h3 className="text-base font-semibold text-slate-800">Inventory Count</h3>
            <div className="flex-1 min-w-0 flex justify-end">
              <div className="relative max-w-xs w-full">
                <input
                  type="text"
                  value={gridSearch}
                  onChange={(e) => setGridSearch(e.target.value)}
                  placeholder="Search by client name..."
                  className="w-full rounded-lg border border-slate-300 bg-white pl-3 pr-9 py-2 text-sm text-slate-800 placeholder-slate-400 focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
                  aria-label="Search clients"
                />
                <i className="fas fa-search absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden="true" />
              </div>
            </div>
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="text-sm text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1.5 disabled:opacity-50"
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
          ) : (gridDates.length === 0 || gridClients.length === 0) ? (
            <div className="py-16 text-center text-slate-500">
              <i className="fas fa-inbox text-4xl mb-3 opacity-50" aria-hidden="true" />
              <p className="text-sm font-medium">No data to show</p>
              <p className="text-xs mt-1">
                {gridSearch.trim() ? 'No clients match your search.' : 'Ensure the daily count job has run and there is inventory data.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse" role="table">
                <thead>
                  <tr className="bg-[#1e3a5f] text-white">
                    <th className="px-4 py-3 text-left font-semibold whitespace-nowrap sticky left-0 bg-[#1e3a5f] z-10 min-w-[180px]">
                      Client Names
                    </th>
                    {gridDates.map((d) => (
                      <th key={d} className="px-3 py-3 text-center font-semibold whitespace-nowrap">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gridClients.map((client, idx) => (
                    <tr
                      key={client.id}
                      className={`border-b border-slate-200 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                    >
                      <td className={`px-4 py-2.5 text-slate-800 font-medium whitespace-nowrap sticky left-0 z-[1] border-r border-slate-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}`}>
                        {client.name}
                      </td>
                      {gridDates.map((d) => {
                        const n = getGridCount(client.id, d);
                        return (
                          <td key={d} className="px-3 py-2.5 text-center text-slate-700 tabular-nums border-l border-slate-100">
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

export default InventoryDailyCount;
