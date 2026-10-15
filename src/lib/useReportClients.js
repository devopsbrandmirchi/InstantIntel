import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { withTimeout } from './requestWithTimeout';
import { nextSelectedClientIdAfterLoad } from './reconcileReportClientSelection';
import {
  assignedClientIdsKey,
  fetchReportClients,
  invalidateReportClientsCache,
  reportClientsEqual,
} from './loadReportClients';

const CLIENTS_LOAD_TIMEOUT_MS = 40000;

/**
 * Stable report client dropdown state — loads only when user/assignment scope changes,
 * skips redundant setState, and preserves "All clients" when allowed.
 *
 * @param {{
 *   currentUser: { id?: string, role?: string, assignedClientIds?: unknown[] } | null,
 *   allowAllClients?: boolean,
 * }} opts
 */
export function useReportClients({ currentUser, allowAllClients = false }) {
  const { refreshProfile } = useAuth();
  const role = (currentUser?.role || '').toLowerCase();
  const isAdmin = role === 'admin';
  const isRestrictedByAssignment = !isAdmin;
  const assignmentsUnavailable =
    isRestrictedByAssignment && !!currentUser && currentUser.assignedClientIdsLoaded === false;
  const assignmentKey = assignedClientIdsKey(currentUser?.assignedClientIds);
  const assignedClientIds = useMemo(
    () => (assignmentKey ? assignmentKey.split(',').map(Number) : []),
    [assignmentKey]
  );

  const [clients, setClients] = useState([]);
  const [clientsError, setClientsError] = useState(null);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const loadGen = useRef(0);

  const applyClientList = useCallback(
    (list) => {
      setClientsLoaded(true);
      setClients((prev) => (reportClientsEqual(prev, list) ? prev : list));
      setSelectedClientId((prev) => {
        const next = nextSelectedClientIdAfterLoad(list, prev, { allowAllClients });
        return next === String(prev) || (next === '' && prev === '') ? prev : next;
      });
    },
    [allowAllClients]
  );

  const loadClients = useCallback(
    async ({ bypassCache = false } = {}) => {
      const gen = ++loadGen.current;
      setClientsError(null);
      if (assignmentsUnavailable) {
        // Reloading the profile updates assignmentKey, which re-runs this load with real IDs.
        if (bypassCache) void refreshProfile();
        setClientsError('Could not load your assigned clients. Click Retry.');
        return;
      }
      try {
        if (bypassCache) invalidateReportClientsCache();
        const { data, error } = await withTimeout(
          fetchReportClients({
            restrictByAssignment: isRestrictedByAssignment,
            assignedClientIds,
            bypassCache,
          }),
          CLIENTS_LOAD_TIMEOUT_MS,
          'Loading clients timed out. Click Retry or refresh the page.'
        );
        if (gen !== loadGen.current) return;
        if (error) throw error;
        applyClientList(data || []);
      } catch (err) {
        if (gen !== loadGen.current) return;
        console.error('Error loading clients:', err);
        setClientsLoaded(true);
        setClients([]);
        setSelectedClientId('');
        setClientsError(err?.message || 'Failed to load clients. Check your connection or permissions.');
      }
    },
    [isRestrictedByAssignment, assignmentKey, assignedClientIds, applyClientList, assignmentsUnavailable, refreshProfile]
  );

  useEffect(() => {
    void loadClients({ bypassCache: false });
  }, [currentUser?.id, isRestrictedByAssignment, assignmentKey, loadClients]);

  const autoRetriedFor = useRef(null);
  useEffect(() => {
    if (!assignmentsUnavailable || autoRetriedFor.current === currentUser?.id) return;
    autoRetriedFor.current = currentUser?.id;
    void refreshProfile();
  }, [assignmentsUnavailable, currentUser?.id, refreshProfile]);

  // Clear selection on user change only — do not bump loadGen (that cancels the load above).
  useEffect(() => {
    setSelectedClientId('');
    setClientsLoaded(false);
  }, [currentUser?.id]);

  return {
    clients,
    clientsError,
    clientsLoaded,
    selectedClientId,
    setSelectedClientId,
    assignedClientIds,
    assignmentKey,
    isAdmin,
    isRestrictedByAssignment,
    loadClients,
  };
}
