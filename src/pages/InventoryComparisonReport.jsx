import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/requestWithTimeout';
import { useAuth } from '../contexts/AuthContext';

const REQUEST_TIMEOUT_MS = 25000;
const CLIENTS_LOAD_TIMEOUT_MS = 40000;

const TABLE_HEADER_CLASS = 'bg-brand-navy text-white font-bold text-sm px-3 py-2.5 text-center flex-shrink-0';
const TABLE_FOOTER_CLASS = 'bg-brand-navy text-white font-semibold text-xs';
/** Table area fills card below title and scrolls (parent sets max height). */
const TABLE_BODY_SCROLL_CLASS = 'flex-1 min-h-0 overflow-auto overflow-x-auto overscroll-y-contain';
const TH_STICKY = 'sticky top-0 z-[1] bg-gray-100 shadow-[0_1px_0_0_rgba(209,213,219,1)]';
const TF_STICKY_TD =
  'sticky bottom-0 z-[1] bg-brand-navy shadow-[0_-1px_0_0_rgba(26,51,75,0.35)]';

function parsePrice(val) {
  if (val == null) return 0;
  const s = String(val).replace(/[$,\s]/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/** Mirrors Django `customize_inventory_data` before comparison aggregation. */
function customizeInventoryRow(r) {
  const model =
    r.custom_model != null && String(r.custom_model).trim() !== '' ? r.custom_model : r.model;
  const trim =
    r.custom_trim != null && String(r.custom_trim).trim() !== '' ? r.custom_trim : r.trim;
  let price = r.price;
  if (price === '' || price == null) price = '0.00';
  return { ...r, model, trim, price };
}

function effectiveMake(r) {
  return String(r.custom_make || r.make || '').trim();
}

function effectiveModel(r) {
  const o = customizeInventoryRow(r);
  return String(o.model || '').trim();
}

/**
 * Legacy Python UI showed Description as "[Year] [Manufacturer] [Brand/Model]" (e.g. "2024 Keystone RV Cougar Half-Ton"),
 * not the long marketing `description` field stored in newer feeds.
 */
function buildLegacyStyleDescription(obj) {
  const year =
    obj.year != null && String(obj.year).trim() !== '' ? String(obj.year).trim() : '';
  const mfr = String(obj.custom_make || obj.make || '').trim();
  const mdl = String(obj.model || '').trim();
  return [year, mfr, mdl].filter(Boolean).join(' ');
}

function legacyDescriptionGroupKey(obj) {
  const short = buildLegacyStyleDescription(obj);
  if (short) return short;
  const vin = (obj.vin || '').trim();
  if (vin) return `__no_ymm__${vin}`;
  return `__row__${obj.id ?? 'x'}`;
}

function rowPriceForFilter(r) {
  const o = customizeInventoryRow(r);
  return parsePrice(o.price) || parsePrice(o.formatted_price) || parsePrice(o.msrp) || 0;
}

/** Same buckets as Django `api_inventory_comparison` pricerange filter. */
function priceRangeMatches(p, bucket) {
  if (!bucket) return true;
  switch (bucket) {
    case 'Below 10K':
      return p < 10000;
    case '10K-20K':
      return p >= 10000 && p <= 20000;
    case '20K-30K':
      return p >= 20000 && p <= 30000;
    case '30K-50K':
      return p >= 30000 && p <= 50000;
    case '50K-70K':
      return p >= 50000 && p <= 70000;
    case '70K-80K':
      return p >= 70000 && p <= 80000;
    case '80K Above':
      return p >= 80000;
    default:
      return true;
  }
}

const PRICE_RANGE_OPTIONS = [
  'Below 10K',
  '10K-20K',
  '20K-30K',
  '30K-50K',
  '50K-70K',
  '70K-80K',
  '80K Above'
];

function applyRowFilters(rows, filters) {
  let out = rows;
  if (filters.condition) {
    out = out.filter((r) => (r.condition || '').toLowerCase() === filters.condition.toLowerCase());
  }
  if (filters.manufacturer) {
    const t = filters.manufacturer.toLowerCase();
    out = out.filter((r) => effectiveMake(r).toLowerCase() === t);
  }
  if (filters.brandModel) {
    const t = filters.brandModel.toLowerCase();
    out = out.filter((r) => effectiveModel(r).toLowerCase() === t);
  }
  if (filters.type) {
    out = out.filter((r) => ((r.vehicle_type || r.type || '').toLowerCase()) === filters.type.toLowerCase());
  }
  if (filters.location) {
    out = out.filter((r) => (r.location || '').toLowerCase() === filters.location.toLowerCase());
  }
  if (filters.year) {
    out = out.filter((r) => String(r.year || '') === filters.year);
  }
  if (filters.pricerange) {
    out = out.filter((r) => priceRangeMatches(rowPriceForFilter(r), filters.pricerange));
  }
  return out;
}

/**
 * Same roll-up rules as Django comparison (unique VINs per group, custom_make / custom_model),
 * but the group key and displayed Description match the legacy Python **UI**: Year + manufacturer + model,
 * because Supabase often stores long marketing copy in `description` while the old app showed the short line.
 */
function aggregateInventoryList(filteredRows) {
  const groups = new Map();
  for (const r of filteredRows) {
    const obj = customizeInventoryRow(r);
    const key = legacyDescriptionGroupKey(obj);
    const displayLine = buildLegacyStyleDescription(obj);
    const vin = (obj.vin || '').trim();
    const price = parsePrice(obj.price) || parsePrice(obj.formatted_price) || parsePrice(obj.msrp) || 0;
    const manufacturer = String(obj.custom_make ?? '').trim();
    const brandModel = String(obj.model ?? '').trim();

    let g = groups.get(key);
    if (!g) {
      g = {
        description: displayLine,
        manufacturer,
        brandModel,
        vins: new Set(),
        totalprice: 0,
        units: 0
      };
      groups.set(key, g);
    }
    if (g.vins.has(vin)) continue;
    g.vins.add(vin);
    g.units += 1;
    g.totalprice += price;
  }

  return [...groups.values()]
    .map((g) => ({
      manufacturer: g.manufacturer,
      brandModel: g.brandModel,
      description: g.description,
      units: g.units,
      totalValue: g.totalprice,
      averagePrice: g.units ? Math.round(g.totalprice / g.units) : 0
    }))
    .sort(
      (a, b) =>
        (a.description || '').localeCompare(b.description || '') ||
        (a.manufacturer || '').localeCompare(b.manufacturer || '') ||
        (a.brandModel || '').localeCompare(b.brandModel || '')
    );
}

const InventoryComparisonReport = () => {
  const { currentUser, refreshProfile } = useAuth();
  const isAdmin = (currentUser?.role || '').toLowerCase() === 'admin';
  const isRestrictedByAssignment = !isAdmin;
  const assignedClientIds = useMemo(
    () =>
      Array.isArray(currentUser?.assignedClientIds)
        ? currentUser.assignedClientIds.map(Number).filter(Number.isFinite)
        : [],
    [currentUser?.assignedClientIds]
  );

  const [clients, setClients] = useState([]);
  const [clientsError, setClientsError] = useState(null);
  const [selectedClientIds, setSelectedClientIds] = useState([]);
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rawRows, setRawRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [filters, setFilters] = useState({
    condition: '',
    manufacturer: '',
    brandModel: '',
    type: '',
    location: '',
    year: '',
    pricerange: ''
  });

  /** True on first paint for viewers so we do not flash "no clients" before re-loading profile from DB. */
  const [profileRefreshing, setProfileRefreshing] = useState(!isAdmin);

  useEffect(() => {
    if (isAdmin) {
      setProfileRefreshing(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setProfileRefreshing(true);
      try {
        await refreshProfile();
      } finally {
        if (!cancelled) setProfileRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, refreshProfile]);

  const loadClients = useCallback(async () => {
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
      setClients(data || []);
    } catch (err) {
      console.error('Error loading clients:', err);
      setClients([]);
      setClientsError(err?.message || 'Failed to load clients.');
    }
  }, [isRestrictedByAssignment, assignedClientIds.join(',')]);

  useEffect(() => {
    loadClients();
  }, [loadClients, currentUser?.id]);

  useEffect(() => {
    if (clients.length === 0) {
      setSelectedClientIds([]);
      return;
    }
    setSelectedClientIds((prev) => {
      const valid = prev.filter((id) => clients.some((c) => c.id === id));
      if (valid.length === 0) return [clients[0].id];
      return valid;
    });
  }, [clients]);

  const loadInventory = useCallback(async () => {
    setMessage({ type: '', text: '' });
    if (selectedClientIds.length === 0) {
      setRawRows([]);
      return;
    }
    setLoading(true);
    try {
      if (isRestrictedByAssignment && assignedClientIds.length === 0) {
        setRawRows([]);
        setLoading(false);
        return;
      }
      const q = supabase
        .from('inventorydata')
        .select('*')
        .eq('pull_date', reportDate)
        .in('customer_id', selectedClientIds)
        .order('make', { ascending: true })
        .order('model', { ascending: true });
      const { data, error } = await withTimeout(q, REQUEST_TIMEOUT_MS);
      if (error) throw error;
      setRawRows(data || []);
    } catch (err) {
      console.error('Error loading comparison inventory:', err);
      setRawRows([]);
      setMessage({ type: 'error', text: err?.message || 'Failed to load inventory.' });
    } finally {
      setLoading(false);
    }
  }, [reportDate, selectedClientIds.join(','), isRestrictedByAssignment, assignedClientIds.join(',')]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const loadClientsRef = useRef(loadClients);
  const loadInventoryRef = useRef(loadInventory);
  loadClientsRef.current = loadClients;
  loadInventoryRef.current = loadInventory;

  const handleRefresh = async () => {
    setMessage({ type: '', text: '' });
    if (!isAdmin) {
      setProfileRefreshing(true);
      try {
        await refreshProfile();
      } finally {
        setProfileRefreshing(false);
      }
    }
    await new Promise((r) => setTimeout(r, 0));
    loadClientsRef.current();
    loadInventoryRef.current();
  };

  const clientNameById = useMemo(
    () => Object.fromEntries(clients.map((c) => [c.id, c.full_name || `Client #${c.id}`])),
    [clients]
  );

  const distinctValues = useMemo(() => {
    const conditions = [...new Set(rawRows.map((r) => r.condition).filter(Boolean))].sort();
    const makesSet = new Set();
    const modelsSet = new Set();
    rawRows.forEach((r) => {
      const mk = effectiveMake(r);
      const md = effectiveModel(r);
      if (mk) makesSet.add(mk);
      if (md) modelsSet.add(md);
    });
    const makes = [...makesSet].sort();
    const models = [...modelsSet].sort();
    const types = [...new Set(rawRows.map((r) => r.vehicle_type || r.type).filter(Boolean))].sort();
    const locations = [...new Set(rawRows.map((r) => r.location).filter(Boolean))].sort();
    const years = [...new Set(rawRows.map((r) => r.year).filter(Boolean))].sort((a, b) =>
      String(b || '').localeCompare(String(a || ''))
    );
    return { conditions, makes, models, types, locations, years };
  }, [rawRows]);

  const tablesByClient = useMemo(() => {
    const out = new Map();
    for (const cid of selectedClientIds) {
      const rowsForClient = rawRows.filter((r) => Number(r.customer_id) === Number(cid));
      const filtered = applyRowFilters(rowsForClient, filters);
      const list = aggregateInventoryList(filtered);
      const grandUnits = list.reduce((s, x) => s + x.units, 0);
      const grandValue = list.reduce((s, x) => s + x.totalValue, 0);
      out.set(cid, { list, grandUnits, grandValue });
    }
    return out;
  }, [rawRows, selectedClientIds, filters]);

  const toggleClient = (id) => {
    const numId = Number(id);
    setSelectedClientIds((prev) => {
      if (prev.includes(numId)) {
        if (prev.length <= 1) return prev;
        return prev.filter((x) => x !== numId);
      }
      return [...prev, numId];
    });
  };

  const inputClass =
    'text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/60 bg-white min-h-0 h-7';
  const labelClass = 'block text-xs font-medium text-gray-700 mb-1';

  const noClientsAssigned = isRestrictedByAssignment && assignedClientIds.length === 0;
  const showNoClientsBanner = noClientsAssigned && !profileRefreshing;
  const showProfileRefreshingNote = isRestrictedByAssignment && profileRefreshing;

  return (
    <div className="bg-white rounded-lg shadow-md p-4 text-xs">
      <div className="flex flex-wrap justify-between items-start gap-3 mb-3">
        <div>
          <h2 className="text-base font-bold text-gray-800">Inventory comparison</h2>
          <p className="text-gray-600 mt-1 max-w-2xl">
            Side-by-side tables use the same roll-up as the legacy app: <strong>unique VINs</strong> per line, with{' '}
            <strong>custom_model</strong> and <strong>custom_make</strong>. The <strong>Description</strong> column shows{' '}
            <strong>Year + manufacturer + model</strong> (legacy Python UI), not the long marketing text in the database.
            One client is selected by default; add more with checkboxes.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className={labelClass} htmlFor="comparison-date">
              Date
            </label>
            <input
              id="comparison-date"
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading}
            className="h-7 px-3 text-xs font-medium rounded border border-brand-navy bg-brand-navy text-white hover:bg-brand-navy disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`} aria-hidden />
            Refresh
          </button>
        </div>
      </div>

      {showProfileRefreshingNote && (
        <p className="text-slate-700 bg-slate-100 border border-slate-200 rounded px-3 py-2 mb-3 flex items-center gap-2">
          <i className="fas fa-spinner fa-spin text-slate-500" aria-hidden />
          Loading your assigned clients from your profile…
        </p>
      )}

      {showNoClientsBanner && (
        <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3">
          You do not have any clients assigned. Ask an administrator to assign clients to your profile, then click{' '}
          <strong>Refresh</strong>. If you were just assigned clients, refresh reloads your profile without signing out.
        </p>
      )}

      {clientsError && (
        <p className="text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3 flex flex-wrap items-center gap-2">
          {clientsError}
          <button type="button" onClick={loadClients} className="text-brand-teal hover:underline font-medium">
            Retry
          </button>
        </p>
      )}

      {!noClientsAssigned && clients.length > 0 && (
        <div className="mb-4 p-3 border border-gray-200 rounded-md bg-gray-50">
          <p className={labelClass}>Clients to compare</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-2">
            {clients.map((c) => {
              const checked = selectedClientIds.includes(c.id);
              return (
                <li key={c.id}>
                  <label className="inline-flex items-center gap-2 cursor-pointer text-gray-800">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleClient(c.id)}
                      className="rounded border-gray-300 text-brand-teal focus:ring-brand-teal/60"
                    />
                    <span>{c.full_name || `Client #${c.id}`}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="text-gray-500 mt-2 text-[11px]">At least one client must stay selected.</p>
        </div>
      )}

      <div className="mb-4">
        <p className={`${labelClass} text-gray-800`}>Filters</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-2">
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
          <div>
            <label className={labelClass}>Price range</label>
            <select
              value={filters.pricerange}
              onChange={(e) => setFilters((f) => ({ ...f, pricerange: e.target.value }))}
              className={`w-full ${inputClass}`}
            >
              <option value="">All</option>
              {PRICE_RANGE_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
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
              onClick={() => loadInventory()}
              className="px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-100"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 py-6">Loading inventory…</p>
      ) : selectedClientIds.length === 0 ? (
        <p className="text-gray-500 py-6">Select at least one client.</p>
      ) : (
        <div className="flex flex-row gap-4 overflow-x-auto pb-2 items-stretch">
          {selectedClientIds.map((cid) => {
            const { list, grandUnits, grandValue } = tablesByClient.get(cid) || {
              list: [],
              grandUnits: 0,
              grandValue: 0
            };
            const name = clientNameById[cid] || `Client #${cid}`;
            return (
              <div
                key={cid}
                className="flex-shrink-0 w-[min(100%,520px)] min-w-[280px] max-h-[min(75vh,40rem)] border border-gray-300 rounded overflow-hidden shadow-md bg-white flex flex-col"
              >
                <div className={TABLE_HEADER_CLASS}>{name}</div>
                <div className={`${TABLE_BODY_SCROLL_CLASS} border-t border-gray-200`}>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-gray-300">
                        <th
                          className={`text-left font-semibold text-gray-800 px-2 py-2 border-b border-gray-200 ${TH_STICKY}`}
                        >
                          Manufacturer
                        </th>
                        <th
                          className={`text-left font-semibold text-gray-800 px-2 py-2 border-b border-gray-200 ${TH_STICKY}`}
                        >
                          Brand/Model
                        </th>
                        <th
                          className={`text-left font-semibold text-gray-800 px-2 py-2 border-b border-gray-200 ${TH_STICKY}`}
                        >
                          Description
                        </th>
                        <th
                          className={`text-right font-semibold text-gray-800 px-2 py-2 border-b border-gray-200 whitespace-nowrap ${TH_STICKY}`}
                        >
                          Units
                        </th>
                        <th
                          className={`text-right font-semibold text-gray-800 px-2 py-2 border-b border-gray-200 whitespace-nowrap ${TH_STICKY}`}
                        >
                          Avg price
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {list.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-gray-500">
                            No rows for this client with the current filters.
                          </td>
                        </tr>
                      ) : (
                        list.map((item, idx) => (
                          <tr key={`${cid}-${idx}`} className="bg-white">
                            <td className="px-2 py-1.5 text-gray-900 align-top">{item.manufacturer || '—'}</td>
                            <td className="px-2 py-1.5 text-gray-900 align-top">{item.brandModel || '—'}</td>
                            <td className="px-2 py-1.5 text-gray-700 align-top">{item.description || '—'}</td>
                            <td className="px-2 py-1.5 text-right text-gray-900 tabular-nums">{item.units}</td>
                            <td className="px-2 py-1.5 text-right text-gray-900 tabular-nums">
                              ${item.averagePrice.toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {list.length > 0 && (
                      <tfoot>
                        <tr className={TABLE_FOOTER_CLASS}>
                          <td colSpan={3} className={`px-2 py-2.5 text-left ${TF_STICKY_TD}`}>
                            Grand total
                          </td>
                          <td className={`px-2 py-2.5 text-right tabular-nums ${TF_STICKY_TD}`}>
                            {grandUnits}
                          </td>
                          <td className={`px-2 py-2.5 text-right tabular-nums ${TF_STICKY_TD}`}>
                            ${Math.round(grandValue).toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && selectedClientIds.length > 0 && (
        <p className="text-gray-500 mt-3 text-[11px]">
          Snapshot date {reportDate}. Each row groups distinct VINs sharing the same year / manufacturer / model line. Footer = sum of units and total value.
        </p>
      )}
    </div>
  );
};

export default InventoryComparisonReport;
