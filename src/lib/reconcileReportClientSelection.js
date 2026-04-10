/**
 * After loading clients for a report dropdown, keep selection valid when the user
 * or their assigned clients change (avoids stale rows from the previous session).
 *
 * @param {Array<{ id: string | number }>} list - clients returned for the current user
 * @param {string} previousSelected - current selectedClientId state
 * @param {{ allowAllClients?: boolean }} [opts] - if true, '' means "all clients" and is preserved when valid
 * @returns {string} next selectedClientId
 */
export function nextSelectedClientIdAfterLoad(list, previousSelected, opts = {}) {
  const { allowAllClients = false } = opts;
  const prev = previousSelected == null ? '' : String(previousSelected);
  if (!list.length) return '';
  const ids = new Set(list.map((c) => String(c.id)));
  if (allowAllClients) {
    if (!prev) return '';
    if (!ids.has(prev)) return '';
    return prev;
  }
  if (!prev || !ids.has(prev)) return String(list[0].id);
  return prev;
}
