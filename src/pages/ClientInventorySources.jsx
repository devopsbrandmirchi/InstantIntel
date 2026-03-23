import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/requestWithTimeout';

const CLIENTS_LOAD_TIMEOUT_MS = 45000;
const PARENT_MAX_LEN = 4;

const inventoryLabel = (scrap, pull) => {
  if (scrap && pull) return { text: 'Both enabled', tone: 'amber' };
  if (scrap) return { text: 'Scrap feed', tone: 'slate' };
  if (pull) return { text: 'Hoot (API pull)', tone: 'blue' };
  return { text: 'Not set', tone: 'gray' };
};

const ClientInventorySources = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceUpdatingId, setSourceUpdatingId] = useState(null);
  const [activeTogglingId, setActiveTogglingId] = useState(null);
  const [parentDraft, setParentDraft] = useState({});
  const [parentSavingId, setParentSavingId] = useState(null);
  const [dealershipDraft, setDealershipDraft] = useState({});
  const [dealershipSavingId, setDealershipSavingId] = useState(null);
  const mountedRef = React.useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    loadClients();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadClients = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('clients')
          .select('id, full_name, dealership_name, scrap_feed, active_pull, is_active, parent_client')
          .order('full_name', { ascending: true }),
        CLIENTS_LOAD_TIMEOUT_MS,
        'Loading clients timed out. Click Retry or refresh the page.'
      );
      if (error) throw error;
      const list = data || [];
      if (mountedRef.current) {
        setClients(list);
        setParentDraft(
          Object.fromEntries(list.map((c) => [c.id, (c.parent_client ?? '').slice(0, PARENT_MAX_LEN)]))
        );
        setDealershipDraft(
          Object.fromEntries(list.map((c) => [c.id, c.dealership_name ?? '']))
        );
      }
    } catch (err) {
      console.error('Error loading clients:', err);
      if (mountedRef.current) {
        setClients([]);
        setMessage({
          type: 'error',
          text: err?.message || 'Failed to load clients.'
        });
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const searchLower = searchQuery.trim().toLowerCase();
  const filteredClients = useMemo(() => {
    if (!searchLower) return clients;
    return clients.filter((c) => {
      const hay = [
        c.full_name,
        c.dealership_name,
        c.parent_client,
        String(c.id)
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(searchLower);
    });
  }, [clients, searchLower]);

  const patchClientLocal = useCallback((id, patch) => {
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const setInventorySource = async (client, mode) => {
    const scrap = mode === 'scrap';
    const pull = mode === 'hoot';
    if (client.scrap_feed === scrap && client.active_pull === pull) return;

    setSourceUpdatingId(client.id);
    setMessage({ type: '', text: '' });
    try {
      const { error } = await supabase
        .from('clients')
        .update({ scrap_feed: scrap, active_pull: pull })
        .eq('id', client.id);
      if (error) throw error;
      patchClientLocal(client.id, { scrap_feed: scrap, active_pull: pull });
      setMessage({
        type: 'success',
        text: `Inventory source updated for ${client.full_name || 'client'}.`
      });
      window.setTimeout(() => setMessage({ type: '', text: '' }), 3500);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: err?.message || 'Could not update inventory source.' });
    } finally {
      setSourceUpdatingId(null);
    }
  };

  const toggleClientActive = async (client) => {
    const next = !client.is_active;
    setActiveTogglingId(client.id);
    setMessage({ type: '', text: '' });
    try {
      const { error } = await supabase.from('clients').update({ is_active: next }).eq('id', client.id);
      if (error) throw error;
      patchClientLocal(client.id, { is_active: next });
      setMessage({
        type: 'success',
        text: `${client.full_name || 'Client'} is now ${next ? 'active' : 'inactive'}.`
      });
      window.setTimeout(() => setMessage({ type: '', text: '' }), 3500);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: err?.message || 'Could not update active status.' });
    } finally {
      setActiveTogglingId(null);
    }
  };

  const updateParentDraft = (id, value) => {
    const v = value.slice(0, PARENT_MAX_LEN);
    setParentDraft((prev) => ({ ...prev, [id]: v }));
  };

  const updateDealershipDraft = (id, value) => {
    setDealershipDraft((prev) => ({ ...prev, [id]: value }));
  };

  const saveDealershipName = async (client) => {
    const raw = dealershipDraft[client.id] ?? client.dealership_name ?? '';
    const trimmed = raw.trim();
    const forDb = trimmed === '' ? null : trimmed;
    const current = (client.dealership_name ?? '').trim() || null;
    if (forDb === current) return;

    setDealershipSavingId(client.id);
    setMessage({ type: '', text: '' });
    try {
      const { error } = await supabase.from('clients').update({ dealership_name: forDb }).eq('id', client.id);
      if (error) throw error;
      patchClientLocal(client.id, { dealership_name: forDb });
      setDealershipDraft((prev) => ({ ...prev, [client.id]: forDb ?? '' }));
      setMessage({ type: 'success', text: 'Dealership name saved.' });
      window.setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: err?.message || 'Could not save dealership name.' });
    } finally {
      setDealershipSavingId(null);
    }
  };

  const saveParentClient = async (client) => {
    const value = (parentDraft[client.id] ?? client.parent_client ?? '').slice(0, PARENT_MAX_LEN);
    const trimmed = value.trim();
    if (trimmed === (client.parent_client ?? '').trim()) return;

    setParentSavingId(client.id);
    setMessage({ type: '', text: '' });
    try {
      const { error } = await supabase.from('clients').update({ parent_client: trimmed }).eq('id', client.id);
      if (error) throw error;
      patchClientLocal(client.id, { parent_client: trimmed });
      setParentDraft((prev) => ({ ...prev, [client.id]: trimmed }));
      setMessage({ type: 'success', text: 'Parent client code saved.' });
      window.setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: err?.message || 'Could not save parent client.' });
    } finally {
      setParentSavingId(null);
    }
  };

  const badgeTone = (tone) => {
    const map = {
      slate: 'bg-slate-700 text-white border-slate-800 shadow-sm',
      blue: 'bg-sky-700 text-white border-sky-800 shadow-sm',
      gray: 'bg-slate-500 text-white border-slate-600 shadow-sm',
      amber: 'bg-amber-600 text-white border-amber-700 shadow-sm'
    };
    return map[tone] || map.gray;
  };

  return (
    <div className="min-h-0">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4">
          <h2 className="text-lg font-semibold tracking-tight text-white">Client inventory sources</h2>
          <p className="mt-1 text-sm text-slate-300 max-w-2xl">
            Choose whether inventory is ingested via scrap feed or Hoot API pull, set dealership display names,
            account status, and the four-character parent client code.
          </p>
        </div>

        <div className="px-4 py-3 sm:px-5 border-b border-slate-100 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="relative flex-1 max-w-md">
            <i
              className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm"
              aria-hidden
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, dealership, parent code, or ID…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/40 focus:border-slate-300"
            />
          </div>
          <button
            type="button"
            onClick={loadClients}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <i className="fas fa-rotate-right text-slate-500" aria-hidden />
            Refresh
          </button>
        </div>

        {message.text && (
          <div
            className={`mx-4 sm:mx-5 mt-4 px-4 py-3 rounded-lg text-sm flex flex-wrap items-center justify-between gap-2 border ${
              message.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}
          >
            <span>{message.text}</span>
            {message.type === 'error' && (
              <button
                type="button"
                onClick={() => {
                  setMessage({ type: '', text: '' });
                  loadClients();
                }}
                className="text-sm font-medium text-red-700 hover:underline"
              >
                Retry
              </button>
            )}
          </div>
        )}

        <div className="overflow-x-auto">
          {loading ? (
            <div className="px-5 py-12 text-center text-slate-500 text-sm">Loading clients…</div>
          ) : filteredClients.length === 0 ? (
            <div className="px-5 py-12 text-center text-slate-500 text-sm">
              {clients.length === 0
                ? 'No clients found.'
                : 'No clients match your search. Try a different term.'}
            </div>
          ) : (
            <table className="min-w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-100/90 text-slate-600 text-xs font-semibold uppercase tracking-wider border-b border-slate-200">
                  <th className="px-4 py-3 whitespace-nowrap">Client</th>
                  <th className="px-4 py-3 whitespace-nowrap min-w-[200px]">Dealership name</th>
                  <th className="px-4 py-3 whitespace-nowrap bg-amber-100 text-amber-950 font-bold uppercase tracking-wide border-x border-amber-200/80">
                    Current source
                  </th>
                  <th className="px-4 py-3 min-w-[240px]">Inventory source</th>
                  <th className="px-4 py-3 whitespace-nowrap">Active</th>
                  <th className="px-4 py-3 min-w-[140px]">Parent client</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClients.map((client) => {
                  const { text, tone } = inventoryLabel(client.scrap_feed, client.active_pull);
                  const busy = sourceUpdatingId === client.id;
                  return (
                    <tr key={client.id} className="bg-white hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-slate-900">{client.full_name || '—'}</div>
                        <div className="text-xs text-slate-500 mt-0.5 font-mono">ID {client.id}</div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col gap-2 min-w-[12rem] max-w-[20rem]">
                          <input
                            type="text"
                            value={dealershipDraft[client.id] ?? ''}
                            onChange={(e) => updateDealershipDraft(client.id, e.target.value)}
                            placeholder="Dealership display name"
                            className="w-full text-sm px-2 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
                            aria-label={`Dealership name for ${client.full_name}`}
                          />
                          <button
                            type="button"
                            onClick={() => saveDealershipName(client)}
                            disabled={dealershipSavingId === client.id}
                            className="self-start px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-50"
                          >
                            {dealershipSavingId === client.id ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top bg-amber-50/60 border-x border-amber-100">
                        <span
                          className={`inline-flex items-center px-3 py-1.5 rounded-md text-sm font-bold border-2 ${badgeTone(tone)}`}
                        >
                          {text}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 shadow-inner">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setInventorySource(client, 'scrap')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                              client.scrap_feed && !client.active_pull
                                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                                : 'text-slate-600 hover:text-slate-900'
                            } disabled:opacity-50`}
                          >
                            Scrap feed
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setInventorySource(client, 'hoot')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                              client.active_pull && !client.scrap_feed
                                ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                                : 'text-slate-600 hover:text-slate-900'
                            } disabled:opacity-50`}
                          >
                            Hoot (API)
                          </button>
                        </div>
                        {busy && (
                          <span className="block mt-1 text-xs text-slate-500">Updating…</span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <button
                          type="button"
                          onClick={() => toggleClientActive(client)}
                          disabled={activeTogglingId === client.id}
                          className={`min-w-[88px] px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            client.is_active
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                          } disabled:opacity-50`}
                        >
                          {activeTogglingId === client.id ? '…' : client.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={parentDraft[client.id] ?? ''}
                            onChange={(e) => updateParentDraft(client.id, e.target.value)}
                            maxLength={PARENT_MAX_LEN}
                            className="w-20 font-mono text-sm px-2 py-1.5 border border-slate-200 rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400/30"
                            aria-label={`Parent client code for ${client.full_name}`}
                          />
                          <button
                            type="button"
                            onClick={() => saveParentClient(client)}
                            disabled={parentSavingId === client.id}
                            className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-900 disabled:opacity-50"
                          >
                            {parentSavingId === client.id ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">Max {PARENT_MAX_LEN} characters</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientInventorySources;
