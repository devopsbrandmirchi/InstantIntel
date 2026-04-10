import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/requestWithTimeout';
import { useAuth } from '../contexts/AuthContext';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const REQUEST_TIMEOUT_MS = 20000;
const CLIENTS_LOAD_TIMEOUT_MS = 40000;

function parsePrice(val) {
  if (val == null) return 0;
  const s = String(val).replace(/[$,\s]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function escapeCsvCell(val) {
  const s = val == null ? '' : String(val);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const InventoryReport = () => {
  const { currentUser } = useAuth();
  const isAdmin = (currentUser?.role || '').toLowerCase() === 'admin';
  const isRestrictedByAssignment = !isAdmin;
  const assignedClientIds = useMemo(
    () => (Array.isArray(currentUser?.assignedClientIds) ? currentUser.assignedClientIds.map(Number).filter(Number.isFinite) : []),
    [currentUser?.assignedClientIds]
  );
  const [clients, setClients] = useState([]);
  const [clientsError, setClientsError] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [reportDate, setReportDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [rawRows, setRawRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [filters, setFilters] = useState({
    condition: '',
    manufacturer: '',
    brandModel: '',
    type: '',
    location: '',
    year: ''
  });

  const loadClients = async () => {
    setClientsError(null);
    try {
      const { data, error } = await withTimeout(
        (() => {
          let q = supabase.from('clients').select('id, full_name').eq('is_active', true);
          if (isRestrictedByAssignment) {
            if (assignedClientIds.length === 0) return q.limit(0);
            q = q.in('id', assignedClientIds);
          }
          return q.order('full_name');
        })(),
        CLIENTS_LOAD_TIMEOUT_MS,
        'Loading clients timed out. Click Retry or refresh the page.'
      );
      if (error) throw error;
      const list = data || [];
      setClients(list);
      if (!selectedClientId && list.length > 0) setSelectedClientId(String(list[0].id));
      if (list.length === 0) setSelectedClientId('');
    } catch (err) {
      console.error('Error loading clients:', err);
      setClients([]);
      setSelectedClientId('');
      setClientsError(err?.message || 'Failed to load clients. Check your connection or permissions.');
    }
  };

  const loadInventoryData = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      let q = supabase.from('inventorydata').select('*');
      if (isRestrictedByAssignment) {
        if (assignedClientIds.length === 0) {
          setRawRows([]);
          setLoading(false);
          return;
        }
        q = q.in('customer_id', assignedClientIds);
      }
      if (selectedClientId) q = q.eq('customer_id', Number(selectedClientId));
      if (reportDate) q = q.eq('pull_date', reportDate);
      const { data, error } = await withTimeout(
        q.order('make', { ascending: true }).order('model', { ascending: true }),
        REQUEST_TIMEOUT_MS
      );
      if (error) throw error;
      setRawRows(data || []);
    } catch (err) {
      console.error('Error loading inventory:', err);
      setRawRows([]);
      setMessage({ type: 'error', text: err?.message || 'Failed to load inventory. Try again or refresh.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, [currentUser?.id, isRestrictedByAssignment, assignedClientIds.join(',')]);

  useEffect(() => {
    loadInventoryData();
  }, [selectedClientId, reportDate]);

  const filteredRows = useMemo(() => {
    let rows = rawRows;
    if (filters.condition) rows = rows.filter((r) => (r.condition || '').toLowerCase() === filters.condition.toLowerCase());
    if (filters.manufacturer) rows = rows.filter((r) => (r.make || '').toLowerCase() === filters.manufacturer.toLowerCase());
    if (filters.brandModel) rows = rows.filter((r) => (r.model || '').toLowerCase() === filters.brandModel.toLowerCase());
    if (filters.type) rows = rows.filter((r) => ((r.vehicle_type || r.type || '').toLowerCase()) === filters.type.toLowerCase());
    if (filters.location) rows = rows.filter((r) => (r.location || '').toLowerCase() === filters.location.toLowerCase());
    if (filters.year) rows = rows.filter((r) => (r.year || '') === filters.year);
    return rows;
  }, [rawRows, filters]);

  const distinctValues = useMemo(() => {
    const conditions = [...new Set(rawRows.map((r) => r.condition).filter(Boolean))].sort();
    const makes = [...new Set(rawRows.map((r) => r.make).filter(Boolean))].sort();
    const models = [...new Set(rawRows.map((r) => r.model).filter(Boolean))].sort();
    const types = [...new Set(rawRows.map((r) => r.vehicle_type || r.type).filter(Boolean))].sort();
    const locations = [...new Set(rawRows.map((r) => r.location).filter(Boolean))].sort();
    const years = [...new Set(rawRows.map((r) => r.year).filter(Boolean))].sort((a, b) => (b || '').localeCompare(a || ''));
    return { conditions, makes, models, types, locations, years };
  }, [rawRows]);

  const reportAggregates = useMemo(() => {
    const byMake = {};
    const byCondition = {};
    const byLocation = {};
    const byType = {};
    filteredRows.forEach((r) => {
      const make = r.make || '(blank)';
      const cond = r.condition != null && r.condition !== '' ? r.condition : '(blank)';
      const loc = r.location || '(blank)';
      const typ = r.vehicle_type || r.type || '(blank)';
      const value = parsePrice(r.price) || parsePrice(r.formatted_price) || parsePrice(r.msrp) || 0;

      byMake[make] = (byMake[make] || { units: 0, totalValue: 0 });
      byMake[make].units += 1;
      byMake[make].totalValue += value;

      byCondition[cond] = (byCondition[cond] || { units: 0, totalValue: 0 });
      byCondition[cond].units += 1;
      byCondition[cond].totalValue += value;

      byLocation[loc] = (byLocation[loc] || { units: 0, totalValue: 0 });
      byLocation[loc].units += 1;
      byLocation[loc].totalValue += value;

      byType[typ] = (byType[typ] || { units: 0, totalValue: 0 });
      byType[typ].units += 1;
      byType[typ].totalValue += value;
    });

    const manufacturer = Object.entries(byMake).map(([name, o]) => ({ name, units: o.units, totalValue: o.totalValue }));
    const condition = Object.entries(byCondition).map(([name, o]) => ({ name, units: o.units, totalValue: o.totalValue }));
    const location = Object.entries(byLocation).map(([name, o]) => ({ name, units: o.units, totalValue: o.totalValue }));
    const type = Object.entries(byType).map(([name, o]) => ({ name, units: o.units, totalValue: o.totalValue }));

    const listKey = (r) => `${r.make || ''}|${r.model || ''}|${r.condition ?? ''}`;
    const listGroups = {};
    filteredRows.forEach((r) => {
      const k = listKey(r);
      if (!listGroups[k]) listGroups[k] = { manufacturer: r.make || '', brandModel: r.model || '', condition: r.condition ?? '', units: 0, totalValue: 0 };
      const v = parsePrice(r.price) || parsePrice(r.formatted_price) || parsePrice(r.msrp) || 0;
      listGroups[k].units += 1;
      listGroups[k].totalValue += v;
    });
    const inventoryList = Object.values(listGroups).map((g) => ({
      ...g,
      averagePrice: g.units ? Math.round(g.totalValue / g.units) : 0
    }));

    const grandTotalUnits = filteredRows.length;
    const grandTotalValue = filteredRows.reduce((s, r) => s + parsePrice(r.price) || parsePrice(r.formatted_price) || parsePrice(r.msrp) || 0, 0);
    const grandTotalAveragePrice = grandTotalUnits ? Math.round(grandTotalValue / grandTotalUnits) : 0;

    return {
      manufacturer,
      condition,
      location,
      type,
      inventoryList,
      grandTotalUnits,
      grandTotalValue,
      grandTotalAveragePrice
    };
  }, [filteredRows]);

  const { manufacturer, condition, location, type, inventoryList, grandTotalUnits, grandTotalValue, grandTotalAveragePrice } = reportAggregates;

  const typeColors = ['#1A334B', '#2d8b84', '#68C98D', '#3da89f', '#2a4a66', '#52b87a'];

  const typeChartData = type.length > 0
    ? {
        labels: type.map((t) => t.name),
        datasets: [{
          data: type.map((t) => t.units),
          backgroundColor: typeColors,
          borderWidth: 0
        }]
      }
    : null;

  const typeChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label(context) {
            const total = type.reduce((s, t) => s + t.units, 0);
            const pct = total ? ((context.parsed || 0) / total * 100).toFixed(1) : 0;
            return `${context.label}: ${context.parsed} units (${pct}%)`;
          }
        }
      }
    },
    cutout: '60%'
  };

  const downloadInventoryListCsv = () => {
    const headers = ['Manufacturer', 'Brand / Model', 'Condition', 'Units', 'Average Price', 'Total Value'];
    const rows = inventoryList.map((item) => [
      item.manufacturer,
      item.brandModel,
      item.condition,
      item.units,
      item.averagePrice,
      Math.round(item.totalValue)
    ]);
    const csvLines = [
      headers.map(escapeCsvCell).join(','),
      ...rows.map((row) => row.map(escapeCsvCell).join(',')),
      [escapeCsvCell('Grand Total'), '', '', grandTotalUnits, grandTotalAveragePrice, Math.round(grandTotalValue)].join(',')
    ];
    const csv = csvLines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-list-${reportDate}${selectedClientId ? `-client-${selectedClientId}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputClass =
    'text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/60 bg-white min-h-0 h-7';
  const labelClass = 'block text-xs font-medium text-gray-700 mb-1';
  const cardTitleClass = 'text-xs font-semibold text-brand-navy mb-2 pb-1 border-b border-gray-200';
  const grandTotalRowClass = 'font-bold bg-brand-navy text-white';

  const selectedClientName = selectedClientId
    ? (clients.find((c) => String(c.id) === selectedClientId)?.full_name || 'Client')
    : 'All clients';

  return (
    <div className="text-xs space-y-3">
      <div className="bg-white rounded border border-gray-200 shadow-sm p-3 flex flex-wrap justify-between items-center gap-2">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelClass}>Client</label>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className={inputClass}
              aria-invalid={!!clientsError}
              aria-describedby={clientsError ? 'clients-error' : undefined}
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name || `Client #${c.id}`}</option>
              ))}
            </select>
            {clientsError && (
              <p id="clients-error" className="mt-1 text-red-600 text-xs flex items-center gap-2">
                {clientsError}
                <button type="button" onClick={loadClients} className="text-brand-teal hover:underline font-medium">
                  Retry
                </button>
              </p>
            )}
            {!clientsError && clients.length === 0 && (
              <p className="mt-1 text-gray-500 text-xs">No clients found. Add clients in Client Master.</p>
            )}
          </div>
          <div>
            <label className={labelClass}>Date</label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <span className={`${labelClass} select-none opacity-0 pointer-events-none`} aria-hidden>
              Refresh
            </span>
            <button
              type="button"
              onClick={() => {
                void Promise.all([loadClients(), loadInventoryData()]);
              }}
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3.5 h-7 rounded-md bg-brand-navy text-white shadow-sm hover:bg-brand-navy-light active:bg-brand-navy disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-teal/50 focus:ring-offset-1"
              aria-label="Refresh clients and inventory data"
            >
              <i className={`fas fa-sync-alt ${loading ? 'animate-spin' : ''}`} aria-hidden />
              Refresh
            </button>
          </div>
        </div>
        <div className="text-gray-700 font-semibold text-xs">
          {reportDate} {selectedClientName !== 'All clients' ? ` · ${selectedClientName}` : ''}
        </div>
      </div>

      {message.text && (
        <div className={`mb-3 px-3 py-2 rounded text-sm flex items-center justify-between gap-2 ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>
          <span>{message.text}</span>
          {message.type === 'error' && (
            <button type="button" onClick={() => loadInventoryData()} className="px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-100">Retry</button>
          )}
        </div>
      )}

      <div className="bg-brand-navy text-white px-4 py-2 shadow-sm">
        <h2 className="text-sm font-bold tracking-wide">Current Inventory</h2>
      </div>

      <div className="bg-white rounded border border-gray-200 shadow-sm p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <div>
          <label className={labelClass}>Manufacturer</label>
          <select value={filters.manufacturer} onChange={(e) => setFilters((f) => ({ ...f, manufacturer: e.target.value }))} className={`w-full ${inputClass}`}>
            <option value="">All</option>
            {distinctValues.makes.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Brand / Model</label>
          <select value={filters.brandModel} onChange={(e) => setFilters((f) => ({ ...f, brandModel: e.target.value }))} className={`w-full ${inputClass}`}>
            <option value="">All</option>
            {distinctValues.models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Location</label>
          <select value={filters.location} onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))} className={`w-full ${inputClass}`}>
            <option value="">All</option>
            {distinctValues.locations.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Year</label>
          <select value={filters.year} onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))} className={`w-full ${inputClass}`}>
            <option value="">All</option>
            {distinctValues.years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Condition</label>
          <select value={filters.condition} onChange={(e) => setFilters((f) => ({ ...f, condition: e.target.value }))} className={`w-full ${inputClass}`}>
            <option value="">All</option>
            {distinctValues.conditions.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Type</label>
          <select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))} className={`w-full ${inputClass}`}>
            <option value="">All</option>
            {distinctValues.types.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500 py-4">Loading report...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="bg-white border border-gray-200 rounded p-3 shadow-sm">
              <h3 className={cardTitleClass}>Type</h3>
              <div className="h-[200px] sm:h-[220px]">
                {typeChartData ? <Doughnut data={typeChartData} options={typeChartOptions} /> : <p className="text-gray-500 text-xs">No data</p>}
              </div>
              {type.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-600 mb-1.5">By percentage</p>
                  <ul className="space-y-1 text-xs text-gray-700">
                    {type.map((t, idx) => {
                      const pct = grandTotalUnits ? ((t.units / grandTotalUnits) * 100).toFixed(1) : '0';
                      return (
                        <li key={idx} className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: typeColors[idx % typeColors.length] }} />
                          <span>{t.name}: {pct}%</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded p-3 shadow-sm">
              <h3 className={cardTitleClass}>Manufacturer</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-1 px-1.5 font-semibold text-gray-900">Manufacturer</th>
                      <th className="text-right py-1 px-1.5 font-semibold text-gray-900">Units</th>
                      <th className="text-right py-1 px-1.5 font-semibold text-gray-900">Total Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {manufacturer.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-1 px-1.5 text-gray-700">{item.name}</td>
                        <td className="py-1 px-1.5 text-right text-gray-700">{item.units}</td>
                        <td className="py-1 px-1.5 text-right text-gray-700">${Math.round(item.totalValue).toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className={grandTotalRowClass}>
                      <td className="py-1.5 px-1.5">Grand Total</td>
                      <td className="py-1.5 px-1.5 text-right">{grandTotalUnits}</td>
                      <td className="py-1.5 px-1.5 text-right">${Math.round(grandTotalValue).toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col gap-3 min-h-0">
              <div className="bg-white border border-gray-200 rounded p-3 shadow-sm flex-1 min-h-0">
                <h3 className={cardTitleClass}>Condition</h3>
                <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-1 px-1.5 font-semibold text-gray-900">Condition</th>
                        <th className="text-right py-1 px-1.5 font-semibold text-gray-900">Units</th>
                        <th className="text-right py-1 px-1.5 font-semibold text-gray-900">Total Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {condition.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-1 px-1.5 text-gray-700">{item.name || ''}</td>
                          <td className="py-1 px-1.5 text-right text-gray-700">{item.units}</td>
                          <td className="py-1 px-1.5 text-right text-gray-700">${Math.round(item.totalValue).toLocaleString()}</td>
                        </tr>
                      ))}
                      <tr className={grandTotalRowClass}>
                        <td className="py-1.5 px-1.5">Grand Total</td>
                        <td className="py-1.5 px-1.5 text-right">{grandTotalUnits}</td>
                        <td className="py-1.5 px-1.5 text-right">${Math.round(grandTotalValue).toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded p-3 shadow-sm flex-1 min-h-0">
                <h3 className={cardTitleClass}>Location</h3>
                <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-1 px-1.5 font-semibold text-gray-900">Location</th>
                        <th className="text-right py-1 px-1.5 font-semibold text-gray-900">Units</th>
                        <th className="text-right py-1 px-1.5 font-semibold text-gray-900">Total Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {location.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-1 px-1.5 text-gray-700">{item.name}</td>
                          <td className="py-1 px-1.5 text-right text-gray-700">{item.units}</td>
                          <td className="py-1 px-1.5 text-right text-gray-700">${Math.round(item.totalValue).toLocaleString()}</td>
                        </tr>
                      ))}
                      <tr className={grandTotalRowClass}>
                        <td className="py-1.5 px-1.5">Grand Total</td>
                        <td className="py-1.5 px-1.5 text-right">{grandTotalUnits}</td>
                        <td className="py-1.5 px-1.5 text-right">${Math.round(grandTotalValue).toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
            <div className="bg-brand-navy text-white px-4 py-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold">Inventory List</h3>
              <button
                type="button"
                onClick={downloadInventoryListCsv}
                disabled={inventoryList.length === 0}
                className="px-2 py-1 text-xs rounded bg-white/20 hover:bg-white/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <i className="fas fa-download" />
                Download CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold text-gray-700 uppercase">Manufacturer</th>
                    <th className="px-2 py-1.5 text-left font-semibold text-gray-700 uppercase">Brand / Model</th>
                    <th className="px-2 py-1.5 text-center font-semibold text-gray-700 uppercase">Condition</th>
                    <th className="px-2 py-1.5 text-right font-semibold text-gray-700 uppercase">Units</th>
                    <th className="px-2 py-1.5 text-right font-semibold text-gray-700 uppercase">Average Price</th>
                    <th className="px-2 py-1.5 text-right font-semibold text-gray-700 uppercase">Total Value</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {inventoryList.map((item, idx) => {
                    const showManufacturer = idx === 0 || inventoryList[idx - 1].manufacturer !== item.manufacturer;
                    return (
                      <tr key={idx} className={showManufacturer ? 'bg-gray-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className={`px-2 py-1.5 ${showManufacturer ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                          {showManufacturer ? item.manufacturer : ''}
                        </td>
                        <td className="px-2 py-1.5 text-gray-700">{item.brandModel}</td>
                        <td className="px-2 py-1.5 text-center text-gray-700">{item.condition}</td>
                        <td className="px-2 py-1.5 text-right text-gray-700">{item.units}</td>
                        <td className="px-2 py-1.5 text-right text-gray-700">${item.averagePrice.toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-right text-gray-700">${Math.round(item.totalValue).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                  <tr className={`${grandTotalRowClass} text-xs`}>
                    <td colSpan="3" className="px-2 py-2 text-left">Grand Total</td>
                    <td className="px-2 py-2 text-right">{grandTotalUnits}</td>
                    <td className="px-2 py-2 text-right">${grandTotalAveragePrice.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right">${Math.round(grandTotalValue).toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default InventoryReport;
