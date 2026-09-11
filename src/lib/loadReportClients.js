import { supabase } from './supabase';

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

/**
 * Active clients for report dropdowns / name maps.
 * Slim select + in-memory sort by parent_client (numeric), full_name.
 *
 * @param {{ restrictByAssignment?: boolean, assignedClientIds?: number[] }} [opts]
 * @returns {Promise<{ data: Array<{ id: number|string, full_name: string }>|null, error: Error|null }>}
 */
export async function fetchReportClients(opts = {}) {
  const { restrictByAssignment = false, assignedClientIds = [] } = opts;

  let q = supabase.from('clients').select('id, full_name, parent_client').eq('is_active', true);

  if (restrictByAssignment) {
    if (!assignedClientIds.length) {
      return { data: [], error: null };
    }
    q = q.in('id', assignedClientIds);
  }

  const { data, error } = await q;
  if (error) return { data: null, error };
  return { data: sortReportClients(data), error: null };
}
