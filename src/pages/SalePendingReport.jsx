import React, { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/requestWithTimeout';
import { useAuth } from '../contexts/AuthContext';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
ChartJS.register(ArcElement, Tooltip, Legend);

function todayLocalISODate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** `YYYY-MM-DD` → US display without UTC shift */
function formatYmdUs(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '—';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

const REQUEST_TIMEOUT_MS = 30000;
const CLIENTS_LOAD_TIMEOUT_MS = 40000;

function parsePrice(val) {
  if (val == null) return 0;
  const s = String(val).replace(/[$,\s]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function formatSoldDate(d) {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

/** First non-empty string from row[key] for given keys (used for Brand/Model and Trim from any possible column). */
function firstVal(row, keys) {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

const BRAND_MODEL_KEYS = [
  'custom_model', 'model', 'title', 'description',
  'rv_type', 'rv_category', 'vehicle_type', 'type', 'custom_type', 'custom_type_2',
  'custom_label_0', 'custom_label_1', 'custom_label_2', 'custom_label_3', 'custom_label_4'
];
const TRIM_KEYS = [
  'custom_trim', 'trim', 'rv_class', 'type', 'vehicle_type', 'category', 'motorhome_class',
  'custom_label_0', 'custom_label_1', 'custom_label_2', 'custom_label_3', 'custom_label_4'
];

/** Inventory-derived sold-out rows from `soldoutvins` (sold_date = day after last pull). */
const SalePendingReport = () => {
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
  const [reportDate, setReportDate] = useState(todayLocalISODate);
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
  const [sortBy, setSortBy] = useState('sold_date');
  const [sortAsc, setSortAsc] = useState(false);
  const [vinPopoverRowId, setVinPopoverRowId] = useState(null);
  const vinPopoverRef = useRef(null);

  useEffect(() => {
    if (!vinPopoverRowId) return;
    const onOutside = (e) => {
      if (vinPopoverRef.current && !vinPopoverRef.current.contains(e.target)) setVinPopoverRowId(null);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [vinPopoverRowId]);

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

  const loadReportData = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      let q = supabase.from('soldoutvins').select('*').not('sold_date', 'is', null);
      if (reportDate) q = q.eq('sold_date', reportDate);
      if (isRestrictedByAssignment) {
        if (assignedClientIds.length === 0) {
          setRawRows([]);
          setLoading(false);
          return;
        }
        q = q.in('customer_id', assignedClientIds);
      }
      if (selectedClientId) q = q.eq('customer_id', Number(selectedClientId));
      const { data, error } = await withTimeout(
        q.order('sold_date', { ascending: false }).order('id', { ascending: true }),
        REQUEST_TIMEOUT_MS
      );
      if (error) throw error;
      setRawRows(data || []);
    } catch (err) {
      console.error('Error loading sale pending report:', err);
      setRawRows([]);
      setMessage({ type: 'error', text: err?.message || 'Failed to load sale pending report. Try again or refresh.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, [currentUser?.id, isRestrictedByAssignment, assignedClientIds.join(',')]);

  useEffect(() => {
    loadReportData();
  }, [selectedClientId, reportDate]);

  const filteredRows = useMemo(() => {
    let rows = rawRows;
    const cond = (r) => (r.custom_condition ?? r.condition ?? '');
    const make = (r) => (r.custom_make ?? r.make ?? '');
    const model = (r) => firstVal(r, BRAND_MODEL_KEYS);
    const typeVal = (r) => (r.custom_type ?? r.type ?? r.custom_type_2 ?? '');
    if (filters.condition) rows = rows.filter((r) => cond(r).toLowerCase() === filters.condition.toLowerCase());
    if (filters.manufacturer) rows = rows.filter((r) => make(r).toLowerCase() === filters.manufacturer.toLowerCase());
    if (filters.brandModel) rows = rows.filter((r) => model(r).toLowerCase() === filters.brandModel.toLowerCase());
    if (filters.type) rows = rows.filter((r) => typeVal(r).toLowerCase() === filters.type.toLowerCase());
    if (filters.location) rows = rows.filter((r) => (r.location || '').toLowerCase() === filters.location.toLowerCase());
    if (filters.year) rows = rows.filter((r) => (r.year || '') === filters.year);
    return rows;
  }, [rawRows, filters]);

  const sortedRows = useMemo(() => {
    const rows = [...filteredRows];
    const getVal = (r, key) => {
      const vin = (r.vin && String(r.vin).toUpperCase()) || '';
      const sold = r.sold_date ? new Date(r.sold_date).getTime() : 0;
      const make = (r.custom_make ?? r.make ?? '').toLowerCase();
      const model = firstVal(r, BRAND_MODEL_KEYS).toLowerCase();
      const trim = firstVal(r, TRIM_KEYS).toLowerCase();
      const cond = (r.custom_condition ?? r.condition ?? '').toLowerCase();
      const value = parsePrice(r.price) || parsePrice(r.formatted_price) || 0;
      if (key === 'vin') return vin;
      if (key === 'sold_date') return sold;
      if (key === 'manufacturer') return make;
      if (key === 'brand_model') return model;
      if (key === 'trim') return trim;
      if (key === 'condition') return cond;
      if (key === 'value') return value;
      if (key === 'location') return (r.location || '').toLowerCase();
      return '';
    };
    rows.sort((a, b) => {
      const va = getVal(a, sortBy);
      const vb = getVal(b, sortBy);
      if (typeof va === 'number' && typeof vb === 'number') return sortAsc ? va - vb : vb - va;
      const sa = String(va);
      const sb = String(vb);
      const cmp = sa.localeCompare(sb, undefined, { numeric: true });
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [filteredRows, sortBy, sortAsc]);

  const handleSort = (key) => {
    setSortBy((prev) => {
      if (prev === key) {
        setSortAsc((a) => !a);
        return prev;
      }
      setSortAsc(false);
      return key;
    });
  };

  const SortableHeader = ({ sortKey, children, align = 'left' }) => {
    const isActive = sortBy === sortKey;
    const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
    return (
      <th
        className={`px-2 py-1.5 font-semibold text-gray-700 uppercase cursor-pointer select-none hover:bg-gray-100 rounded ${alignClass}`}
        onClick={() => handleSort(sortKey)}
        role="columnheader"
        aria-sort={isActive ? (sortAsc ? 'ascending' : 'descending') : undefined}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {isActive && <i className={`fas fa-caret-${sortAsc ? 'up' : 'down'} text-[10px]`} />}
        </span>
      </th>
    );
  };

  const distinctValues = useMemo(() => {
    const cond = (r) => (r.custom_condition ?? r.condition ?? '').trim();
    const make = (r) => (r.custom_make ?? r.make ?? '').trim();
    const model = (r) => firstVal(r, BRAND_MODEL_KEYS);
    const trim = (r) => firstVal(r, TRIM_KEYS);
    const typeVal = (r) => (r.custom_type ?? r.type ?? r.custom_type_2 ?? '').trim();
    return {
      conditions: [...new Set(rawRows.map(cond).filter(Boolean))].sort(),
      makes: [...new Set(rawRows.map(make).filter(Boolean))].sort(),
      models: [...new Set(rawRows.map(model).filter(Boolean))].sort(),
      trims: [...new Set(rawRows.map(trim).filter(Boolean))].sort(),
      types: [...new Set(rawRows.map(typeVal).filter(Boolean))].sort(),
      locations: [...new Set(rawRows.map((r) => (r.location || '').trim()).filter(Boolean))].sort(),
      years: [...new Set(rawRows.map((r) => (r.year || '').trim()).filter(Boolean))].sort((a, b) => (b || '').localeCompare(a || ''))
    };
  }, [rawRows]);

  const reportAggregates = useMemo(() => {
    const byMake = {};
    const byCondition = {};
    const byLocation = {};
    const byType = {};
    filteredRows.forEach((r) => {
      const makeVal = r.custom_make ?? r.make ?? '(blank)';
      const condVal = (r.custom_condition ?? r.condition ?? '') || '(blank)';
      const locVal = r.location ?? '(blank)';
      const typeVal = (r.custom_type ?? r.type ?? r.custom_type_2 ?? '') || '(blank)';
      const value = parsePrice(r.price) || parsePrice(r.formatted_price) || 0;

      byMake[makeVal] = (byMake[makeVal] || { units: 0, totalValue: 0 });
      byMake[makeVal].units += 1;
      byMake[makeVal].totalValue += value;

      byCondition[condVal] = (byCondition[condVal] || { units: 0, totalValue: 0 });
      byCondition[condVal].units += 1;
      byCondition[condVal].totalValue += value;

      byLocation[locVal] = (byLocation[locVal] || { units: 0, totalValue: 0 });
      byLocation[locVal].units += 1;
      byLocation[locVal].totalValue += value;

      byType[typeVal] = (byType[typeVal] || { units: 0, totalValue: 0 });
      byType[typeVal].units += 1;
      byType[typeVal].totalValue += value;
    });

    const manufacturer = Object.entries(byMake).map(([name, o]) => ({ name, units: o.units, totalValue: o.totalValue }));
    const condition = Object.entries(byCondition).map(([name, o]) => ({ name, units: o.units, totalValue: o.totalValue }));
    const location = Object.entries(byLocation).map(([name, o]) => ({ name, units: o.units, totalValue: o.totalValue }));
    const type = Object.entries(byType).map(([name, o]) => ({ name, units: o.units, totalValue: o.totalValue }));

    const grandTotalUnits = filteredRows.length;
    const grandTotalValue = filteredRows.reduce(
      (s, r) => s + (parsePrice(r.price) || parsePrice(r.formatted_price) || 0),
      0
    );

    return { manufacturer, condition, location, type, grandTotalUnits, grandTotalValue };
  }, [filteredRows]);

  const { manufacturer, condition, location, type, grandTotalUnits, grandTotalValue } = reportAggregates;

  const typeChartData =
    type.length > 0
      ? {
          labels: type.map((t) => t.name),
          datasets: [
            {
              data: type.map((t) => t.units),
              backgroundColor: [
                '#22C55E',
                '#06B6D4',
                '#1E40AF',
                '#0D9488',
                '#3B82F6',
                '#14B8A6',
                '#60A5FA',
                '#2DD4BF'
              ],
              borderWidth: 0
            }
          ]
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
            const pct = total ? (((context.parsed || 0) / total) * 100).toFixed(1) : 0;
            return `${context.label}: ${context.parsed} units (${pct}%)`;
          }
        }
      }
    },
    cutout: '60%'
  };

  const typeColors = ['#22C55E', '#06B6D4', '#1E40AF', '#0D9488', '#3B82F6', '#14B8A6', '#60A5FA', '#2DD4BF'];

  const inputClass = 'text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white min-h-0 h-7';
  const labelClass = 'block text-xs font-medium text-gray-700 mb-1';

  const selectedClientName = selectedClientId
    ? clients.find((c) => String(c.id) === selectedClientId)?.full_name || 'Client'
    : 'All clients';

  return (
    <div className="bg-white rounded-lg shadow-md p-4 text-xs">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={labelClass}>Client</label>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className={inputClass}
              aria-invalid={!!clientsError}
            >
              <option value="">All clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name || `Client #${c.id}`}
                </option>
              ))}
            </select>
            {clientsError && (
              <p className="mt-1 text-red-600 text-xs flex items-center gap-2">
                {clientsError}
                <button type="button" onClick={loadClients} className="text-blue-600 hover:underline font-medium">
                  Retry
                </button>
              </p>
            )}
          </div>
          <div>
            <label className={labelClass} htmlFor="sale-pending-report-date">
              Report date
            </label>
            <input
              id="sale-pending-report-date"
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value || todayLocalISODate())}
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
                void Promise.all([loadClients(), loadReportData()]);
              }}
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3.5 h-7 rounded-lg bg-slate-700 text-white shadow-sm hover:bg-slate-600 active:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1"
              aria-label="Refresh clients and report data"
            >
              <i className={`fas fa-sync-alt ${loading ? 'animate-spin' : ''}`} aria-hidden />
              Refresh
            </button>
          </div>
        </div>
        <div className="text-gray-700 font-semibold text-xs">
          {selectedClientName !== 'All clients' && `${selectedClientName} · `}
          {formatYmdUs(reportDate)}
        </div>
      </div>

      {message.text && (
        <div
          className={`mb-3 px-3 py-2 rounded text-sm flex items-center justify-between gap-2 ${
            message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'
          }`}
        >
          <span>{message.text}</span>
          {message.type === 'error' && (
            <button
              type="button"
              onClick={() => loadReportData()}
              className="px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-100"
            >
              Retry
            </button>
          )}
        </div>
      )}

      <div className="bg-blue-600 text-white px-4 py-1.5 rounded mb-3">
        <h2 className="text-sm font-bold">Sale pending report</h2>
        <p className="text-[11px] text-white/85 font-normal mt-0.5">
          Rows where <code className="bg-white/15 px-1 rounded">sold_date</code> matches the report date (default today). Source:{' '}
          <code className="bg-white/15 px-1 rounded">soldoutvins</code>.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
        <div>
          <label className={labelClass}>Condition</label>
          <select
            value={filters.condition}
            onChange={(e) => setFilters((f) => ({ ...f, condition: e.target.value }))}
            className={`w-full ${inputClass}`}
          >
            <option value="">All</option>
            {distinctValues.conditions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Manufacturer</label>
          <select
            value={filters.manufacturer}
            onChange={(e) => setFilters((f) => ({ ...f, manufacturer: e.target.value }))}
            className={`w-full ${inputClass}`}
          >
            <option value="">All</option>
            {distinctValues.makes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Brand / Model</label>
          <select
            value={filters.brandModel}
            onChange={(e) => setFilters((f) => ({ ...f, brandModel: e.target.value }))}
            className={`w-full ${inputClass}`}
          >
            <option value="">All</option>
            {distinctValues.models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Type</label>
          <select
            value={filters.type}
            onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
            className={`w-full ${inputClass}`}
          >
            <option value="">All</option>
            {distinctValues.types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Location</label>
          <select
            value={filters.location}
            onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))}
            className={`w-full ${inputClass}`}
          >
            <option value="">All</option>
            {distinctValues.locations.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Year</label>
          <select
            value={filters.year}
            onChange={(e) => setFilters((f) => ({ ...f, year: e.target.value }))}
            className={`w-full ${inputClass}`}
          >
            <option value="">All</option>
            {distinctValues.years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-500 py-4">Loading sale pending report...</p>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 mb-3">
            <div className="bg-white border border-gray-200 rounded p-2 shadow-sm">
              <h3 className="text-xs font-semibold text-blue-600 mb-2 pb-1 border-b border-gray-200">Type</h3>
              <div style={{ height: '180px' }}>
                {typeChartData ? (
                  <Doughnut data={typeChartData} options={typeChartOptions} />
                ) : (
                  <p className="text-gray-500 text-xs">No data</p>
                )}
              </div>
              {type.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-600 mb-1.5">By percentage</p>
                  <ul className="space-y-1 text-xs text-gray-700">
                    {type.map((t, idx) => {
                      const pct = grandTotalUnits ? ((t.units / grandTotalUnits) * 100).toFixed(1) : '0';
                      return (
                        <li key={idx} className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: typeColors[idx % typeColors.length] }}
                          />
                          <span>
                            {t.name}: {pct}%
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded p-2 shadow-sm">
              <h3 className="text-xs font-semibold text-blue-600 mb-2 pb-1 border-b border-gray-200">Manufacturer</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-1 px-1.5 font-medium text-gray-700">Manufacturer</th>
                      <th className="text-right py-1 px-1.5 font-medium text-gray-700">Units</th>
                      <th className="text-right py-1 px-1.5 font-medium text-gray-700">Total Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {manufacturer.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-1 px-1.5 text-gray-700">{item.name}</td>
                        <td className="py-1 px-1.5 text-right text-gray-700">{item.units}</td>
                        <td className="py-1 px-1.5 text-right text-gray-700">
                          ${Math.round(item.totalValue).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold bg-gray-50">
                      <td className="py-1 px-1.5 text-gray-900">Grand Total</td>
                      <td className="py-1 px-1.5 text-right text-gray-900">{grandTotalUnits}</td>
                      <td className="py-1 px-1.5 text-right text-gray-900">
                        ${Math.round(grandTotalValue).toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded p-2 shadow-sm">
              <h3 className="text-xs font-semibold text-blue-600 mb-2 pb-1 border-b border-gray-200">Condition</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-1 px-1.5 font-medium text-gray-700">Condition</th>
                      <th className="text-right py-1 px-1.5 font-medium text-gray-700">Units</th>
                      <th className="text-right py-1 px-1.5 font-medium text-gray-700">Total Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {condition.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-1 px-1.5 text-gray-700">{item.name}</td>
                        <td className="py-1 px-1.5 text-right text-gray-700">{item.units}</td>
                        <td className="py-1 px-1.5 text-right text-gray-700">
                          ${Math.round(item.totalValue).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold bg-gray-50">
                      <td className="py-1 px-1.5 text-gray-900">Grand Total</td>
                      <td className="py-1 px-1.5 text-right text-gray-900">{grandTotalUnits}</td>
                      <td className="py-1 px-1.5 text-right text-gray-900">
                        ${Math.round(grandTotalValue).toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded p-2 shadow-sm">
              <h3 className="text-xs font-semibold text-blue-600 mb-2 pb-1 border-b border-gray-200">Location</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-1 px-1.5 font-medium text-gray-700">Location</th>
                      <th className="text-right py-1 px-1.5 font-medium text-gray-700">Units</th>
                      <th className="text-right py-1 px-1.5 font-medium text-gray-700">Total Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {location.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-1 px-1.5 text-gray-700">{item.name}</td>
                        <td className="py-1 px-1.5 text-right text-gray-700">{item.units}</td>
                        <td className="py-1 px-1.5 text-right text-gray-700">
                          ${Math.round(item.totalValue).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold bg-gray-50">
                      <td className="py-1 px-1.5 text-gray-900">Grand Total</td>
                      <td className="py-1 px-1.5 text-right text-gray-900">{grandTotalUnits}</td>
                      <td className="py-1 px-1.5 text-right text-gray-900">
                        ${Math.round(grandTotalValue).toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
            <div className="bg-blue-600 text-white px-4 py-2 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-bold">Sale pending report — VINs</h3>
              <label className="flex items-center gap-2 text-xs font-medium text-white/95">
                <span className="whitespace-nowrap">Location</span>
                <select
                  value={filters.location}
                  onChange={(e) => setFilters((f) => ({ ...f, location: e.target.value }))}
                  className="text-gray-800 text-xs px-2 py-1 rounded border border-white/30 bg-white min-w-[160px] max-w-[240px] focus:outline-none focus:ring-2 focus:ring-white/80"
                  aria-label="Filter VIN list by location"
                >
                  <option value="">All locations</option>
                  {distinctValues.locations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-[11px] font-mono">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-semibold text-gray-700 uppercase w-8">#</th>
                    <SortableHeader sortKey="vin">VIN No.</SortableHeader>
                    <SortableHeader sortKey="sold_date">Sold Date</SortableHeader>
                    <SortableHeader sortKey="manufacturer">Manufacturer</SortableHeader>
                    <SortableHeader sortKey="brand_model">Brand / Model</SortableHeader>
                    <SortableHeader sortKey="trim">Trim</SortableHeader>
                    <SortableHeader sortKey="condition" align="center">Condition</SortableHeader>
                    <SortableHeader sortKey="location">Location</SortableHeader>
                    <th className="px-2 py-1.5 text-left font-semibold text-gray-700 uppercase">Image</th>
                    <SortableHeader sortKey="value" align="right">Value</SortableHeader>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedRows.map((row, idx) => {
                    const soldDate = row.sold_date;
                    const makeVal = row.custom_make ?? row.make ?? '';
                    const modelVal = (row.model != null && String(row.model).trim() !== '') ? String(row.model).trim() : firstVal(row, BRAND_MODEL_KEYS);
                    const condVal = row.condition ?? row.custom_condition ?? '';
                    const trimVal = (row.trim != null && String(row.trim).trim() !== '') ? String(row.trim).trim() : firstVal(row, TRIM_KEYS);
                    const vinDisplay = (row.vin && String(row.vin).toUpperCase().trim()) || '—';
                    const displayPrice = (row.formatted_price != null && String(row.formatted_price).trim() !== '') ? String(row.formatted_price).trim() : (
                      (row.price != null && String(row.price).trim() !== '') ? String(row.price).trim() : (
                        (parsePrice(row.price) || parsePrice(row.formatted_price)) ? `$${Number(parsePrice(row.price) || parsePrice(row.formatted_price)).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—'
                      )
                    );
                    const showVinPopover = vinPopoverRowId === row.id;
                    return (
                      <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-2 py-1.5 text-gray-600">{idx + 1}</td>
                        <td className="px-2 py-1.5 relative" ref={showVinPopover ? vinPopoverRef : undefined}>
                          <span
                            role="button"
                            tabIndex={0}
                            className={`cursor-pointer ${row.image_url ? 'text-blue-600 hover:underline' : 'text-gray-700'}`}
                            onClick={() => row.image_url && setVinPopoverRowId((id) => (id === row.id ? null : row.id))}
                            onKeyDown={(e) => { if (row.image_url && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setVinPopoverRowId((id) => (id === row.id ? null : row.id)); } }}
                            onMouseEnter={() => row.image_url && setVinPopoverRowId(row.id)}
                            onMouseLeave={() => setVinPopoverRowId((id) => (id === row.id ? null : id))}
                          >
                            {vinDisplay}
                          </span>
                          {row.image_url && showVinPopover && (
                            <div
                              className="absolute left-0 top-full mt-1 z-50 p-0 bg-white border border-gray-200 rounded shadow-lg"
                              style={{ minWidth: '200px' }}
                              onMouseEnter={() => setVinPopoverRowId(row.id)}
                              onMouseLeave={() => setVinPopoverRowId(null)}
                            >
                              <img
                                src={row.image_url}
                                alt="Vehicle"
                                className="block w-[200px] h-auto rounded border-0"
                                style={{ border: '1px solid #000', borderRadius: '4px', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }}
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-gray-700">{formatSoldDate(soldDate)}</td>
                        <td className="px-2 py-1.5 text-gray-700">{makeVal || '—'}</td>
                        <td className="px-2 py-1.5 text-gray-700">{modelVal || '—'}</td>
                        <td className="px-2 py-1.5 text-gray-700">{trimVal || '—'}</td>
                        <td className="px-2 py-1.5 text-center text-gray-700">{condVal || '—'}</td>
                        <td className="px-2 py-1.5 text-gray-700 max-w-[140px] truncate" title={row.location || ''}>
                          {(row.location != null && String(row.location).trim() !== '') ? String(row.location).trim() : '—'}
                        </td>
                        <td className="px-2 py-1.5">
                          {row.image_url ? (
                            <img
                              src={row.image_url}
                              alt=""
                              className="w-10 h-10 object-cover rounded border border-gray-200"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right text-gray-700">{displayPrice}</td>
                      </tr>
                    );
                  })}
                  <tr className="font-semibold bg-gray-100">
                    <td colSpan="9" className="px-2 py-1.5 text-left text-gray-900">
                      Grand Total
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-900">
                      ${Math.round(grandTotalValue).toLocaleString()}
                    </td>
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

export default SalePendingReport;
