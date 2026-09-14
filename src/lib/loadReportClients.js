import { supabase } from './supabase';

const CACHE_TTL_MS = 60_000;
/** @type {Map<string, { at: number, data: Array<{ id: number|string, full_name: string }> }>} */
const reportClientsCache = new Map();

/** Numeric parent_client ascending, then full_name (case-insensitive). */
export function compareReportClients(a, b) {
  const pa = Number(a.parent_client);
  const pb = Number(b.parent_client);
  const na = Number.isFinite(pa) ? pa : Number.POSITIVE_INFINITY;
  const nb = Number.isFinite(pb) ? pb : Number.POSITIVE_INFINITY;
  if (na !== nb) return na - nb;
  return String(a.full_name || '').localeCompare(String(b.full_name || ''), undefined, {
    sensitivity: 'base',
  });
}

/** Sort then strip to dropdown shape `{ id, full_name }`. */
export function sortReportClients(list) {
  return [...(list || [])]
    .sort(compareReportClients)
    .map(({ id, full_name }) => ({ id, full_name }));
}

/** Stable key for assigned-client lists (order-independent). */
export function assignedClientIdsKey(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return '';
  return [...new Set(ids.map(Number).filter(Number.isFinite))].sort((a, b) => a - b).join(',');
}

export function reportClientsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (String(a[i].id) !== String(b[i].id)) return false;
    if ((a[i].full_name || '') !== (b[i].full_name || '')) return false;
  }
  return true;
}

export function invalidateReportClientsCache() {
  reportClientsCache.clear();
}

function cacheKey(restrictByAssignment, assignedClientIds) {
  return `${restrictByAssignment ? '1' : '0'}:${assignedClientIdsKey(assignedClientIds)}`;
}

/**
 * Active clients for report dropdowns / name maps.
 * Slim select + in-memory sort by parent_client (numeric), full_name.
 * Short TTL cache avoids refetch flicker when effects re-run with the same scope.
 *
 * @param {{ restrictByAssignment?: boolean, assignedClientIds?: number[], bypassCache?: boolean }} [opts]
 * @returns {Promise<{ data: Array<{ id: number|string, full_name: string }>|null, error: Error|null }>}
 */
export async function fetchReportClients(opts = {}) {
  const {
    restrictByAssignment = false,
    assignedClientIds = [],
    bypassCache = false,
  } = opts;

  const key = cacheKey(restrictByAssignment, assignedClientIds);
  if (!bypassCache) {
    const hit = reportClientsCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return { data: hit.data, error: null };
    }
  }

  let q = supabase.from('clients').select('id, full_name, parent_client').eq('is_active', true);

  if (restrictByAssignment) {
    if (!assignedClientIds.length) {
      const empty = [];
      reportClientsCache.set(key, { at: Date.now(), data: empty });
      return { data: empty, error: null };
    }
    q = q.in('id', assignedClientIds);
  }

  const { data, error } = await q;
  if (error) return { data: null, error };
  const sorted = sortReportClients(data);
  reportClientsCache.set(key, { at: Date.now(), data: sorted });
  return { data: sorted, error: null };
}
