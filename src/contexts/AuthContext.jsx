import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/requestWithTimeout';
import { recordLoginHistory } from '../lib/loginHistory';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

function mapSupabaseUser(supabaseUser, session) {
  if (!supabaseUser) return null;
  const metadata = supabaseUser.user_metadata || {};
  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? '',
    name: metadata.full_name || metadata.name || metadata.user_name || supabaseUser.email?.split('@')[0] || 'User',
    role: metadata.role || 'viewer',
    token: session?.access_token ?? null,
    refreshToken: session?.refresh_token ?? null
  };
}

/** Postgres bigint[] sometimes serializes as "{1,2,3}" over the wire. */
function parsePostgresBigIntArrayString(raw) {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  if (!t.startsWith('{') || !t.endsWith('}')) return null;
  const inner = t.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(',').map((s) => s.trim()).filter(Boolean);
}

function normalizeClientIds(raw) {
  if (raw == null) return [];
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string') {
    const pgParts = parsePostgresBigIntArrayString(raw);
    if (pgParts !== null) {
      arr = pgParts;
    } else {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) arr = parsed;
      } catch {
        arr = raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }
  } else if (typeof raw === 'object') {
    if (Array.isArray(raw.ids)) arr = raw.ids;
  }
  return [...new Set(arr.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0))];
}

/** One moderate attempt: RPC then table fallback once. Kept short so navigation stays responsive. */
const ROLE_RPC_MS = 5000;
const ROLE_TABLE_MS = 8000;
const PROFILE_MS = 7000;

async function fetchUserRoleFromDb(userId) {
  try {
    const { data: roleName, error } = await withTimeout(
      supabase.rpc('get_my_role'),
      ROLE_RPC_MS,
      'Role fetch timeout'
    );
    if (!error && roleName != null && String(roleName).trim()) return String(roleName).toLowerCase();
  } catch (err) {
    console.warn('get_my_role failed:', err?.message);
  }

  try {
    const { data: urData, error: urError } = await withTimeout(
      supabase.from('user_roles').select('role_id').eq('user_id', userId),
      ROLE_TABLE_MS,
      'Role fetch timeout'
    );
    if (urError || !urData?.length) return null;
    const roleIds = [...new Set(urData.map((r) => r.role_id).filter(Boolean))];
    if (roleIds.length === 0) return null;
    const { data: rolesData, error: rolesError } = await withTimeout(
      supabase.from('roles').select('id, name').in('id', roleIds),
      ROLE_TABLE_MS,
      'Roles fetch timeout'
    );
    if (rolesError || !rolesData?.length) return null;
    const roleNames = rolesData.map((r) => r.name).filter(Boolean);
    if (roleNames.some((n) => String(n).toLowerCase() === 'admin')) return 'admin';
    return roleNames[0] ? String(roleNames[0]).toLowerCase() : null;
  } catch (err) {
    console.warn('Table role fetch failed:', err?.message);
    return null;
  }
}

async function fetchAssignedClientIds(userId) {
  try {
    const { data, error } = await withTimeout(
      supabase.from('profiles').select('clients').eq('id', userId).single(),
      PROFILE_MS,
      'Assigned clients fetch timeout'
    );
    if (error) {
      console.warn('profiles.clients:', error.message || error.code || error);
      return [];
    }
    return normalizeClientIds(data?.clients);
  } catch (e) {
    console.warn('fetchAssignedClientIds:', e?.message || e);
    return [];
  }
}

const CONNECTION_ERROR_MESSAGE = 'Unable to connect. Please check your network and refresh.';

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState(null);

  /** Full DB role + profile. Used on sign-in and explicit refresh only — not on token rotation. */
  const hydrateUserFromSession = async (supabaseUser, session) => {
    const baseUser = mapSupabaseUser(supabaseUser, session);
    let roleFromDb = null;
    let assignedClientIds = [];
    try {
      [roleFromDb, assignedClientIds] = await Promise.all([
        fetchUserRoleFromDb(supabaseUser.id),
        fetchAssignedClientIds(supabaseUser.id)
      ]);
    } catch (err) {
      console.warn('Role/profile load failed:', err?.message);
    }

    setCurrentUser((prev) => {
      const previousRole =
        prev?.id === supabaseUser.id && prev?.role ? String(prev.role).toLowerCase() : null;
      const role = (roleFromDb || previousRole || baseUser.role || '').toLowerCase() || 'viewer';
      return {
        ...baseUser,
        role,
        assignedClientIds
      };
    });
  };

  const hydrateRef = useRef(hydrateUserFromSession);
  hydrateRef.current = hydrateUserFromSession;

  /** Re-load role + assigned clients from DB (e.g. after admin updates your profile while you stay signed in). */
  const refreshProfile = useCallback(async () => {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    if (!session?.user) return;
    await hydrateRef.current(session.user, session);
  }, []);

  /** Token refresh: update JWT only — avoids re-querying role/clients on every link click / idle refresh. */
  const patchSessionTokens = (session) => {
    if (!session?.access_token) return;
    setCurrentUser((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        token: session.access_token ?? null,
        refreshToken: session.refresh_token ?? null
      };
    });
  };

  useEffect(() => {
    let cancelled = false;

    const initSession = async () => {
      try {
        const {
          data: { session }
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session?.user) {
          await hydrateUserFromSession(session.user, session);
          if (!cancelled) setConnectionError(null);
        } else {
          setCurrentUser(null);
          if (!cancelled) setConnectionError(null);
        }
      } catch (err) {
        console.warn('Auth initial load failed:', err?.message);
        if (!cancelled) {
          setCurrentUser(null);
          setConnectionError(err?.message || CONNECTION_ERROR_MESSAGE);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    initSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;

      if (event === 'INITIAL_SESSION') {
        /** `getSession` in initSession already hydrated; this event would duplicate work and cause flicker. */
        return;
      }

      if (event === 'TOKEN_REFRESHED' && session?.user) {
        patchSessionTokens(session);
        return;
      }

      if (event === 'SIGNED_OUT' || !session?.user) {
        setCurrentUser(null);
        setConnectionError(null);
        setLoading(false);
        return;
      }

      /** SIGNED_IN, USER_UPDATED, etc. — reload role from DB */
      try {
        await hydrateUserFromSession(session.user, session);
        setConnectionError(null);
      } catch (err) {
        console.warn('Auth state hydrate failed:', err?.message);
      } finally {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const getAuthToken = () => {
    return currentUser?.token ?? null;
  };

  const login = async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        throw new Error(error.message || 'Invalid credentials. Please try again.');
      }

      if (data?.user && data?.session) {
        await hydrateUserFromSession(data.user, data.session);
        recordLoginHistory({ userId: data.user.id, email: data.user.email }).catch(() => {});
        return { success: true };
      }

      throw new Error('Login failed. No session returned.');
    } catch (error) {
      console.error('Login error:', error);
      if (error instanceof Error) throw error;
      throw new Error('Login failed. Please try again.');
    }
  };

  const signUp = async (email, password, options = {}) => {
    try {
      const { full_name, role } = options;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: full_name || '',
            name: full_name || '',
            role: role || 'user'
          }
        }
      });

      if (error) {
        throw new Error(error.message || 'Sign up failed. Please try again.');
      }

      if (data?.user) {
        return {
          success: true,
          user: data.user,
          message: data.session
            ? 'Account created. You are now signed in.'
            : 'Account created. Check your email to confirm, then sign in.'
        };
      }

      throw new Error('Sign up failed. No user returned.');
    } catch (error) {
      console.error('SignUp error:', error);
      if (error instanceof Error) throw error;
      throw new Error('Sign up failed. Please try again.');
    }
  };

  const updateProfile = async (updates) => {
    try {
      const { full_name, name, phone, email } = updates;
      const dataToSet = {};
      if (full_name !== undefined) dataToSet.full_name = full_name;
      if (name !== undefined) dataToSet.name = name;
      if (full_name !== undefined && !dataToSet.name) dataToSet.name = full_name;
      if (phone !== undefined) dataToSet.phone = phone;

      const payload = { data: dataToSet };
      if (email !== undefined) {
        const role = (currentUser?.role || '').toLowerCase();
        if (role !== 'admin') {
          throw new Error('Only administrators can change the account email.');
        }
        const trimmed = String(email).trim();
        if (!trimmed) throw new Error('Email cannot be empty.');
        payload.email = trimmed;
      }

      const { data, error } = await supabase.auth.updateUser(payload);

      if (error) throw new Error(error.message);
      if (data?.user && data?.session) {
        await hydrateUserFromSession(data.user, data.session);
        return { success: true };
      }
      throw new Error('Update failed.');
    } catch (error) {
      console.error('Update profile error:', error);
      if (error instanceof Error) throw error;
      throw new Error('Failed to update profile.');
    }
  };

  /** Email/password accounts only; verifies current password then sets a new one. */
  const changePassword = async (currentPassword, newPassword) => {
    try {
      const {
        data: { session }
      } = await supabase.auth.getSession();
      const email = session?.user?.email;
      if (!email) throw new Error('Not signed in.');

      const { error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword
      });
      if (signErr) {
        throw new Error(signErr.message?.includes('Invalid') ? 'Current password is incorrect.' : signErr.message);
      }

      const { data, error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message || 'Could not update password.');

      const {
        data: { session: nextSession }
      } = await supabase.auth.getSession();
      if (data?.user && nextSession) {
        await hydrateUserFromSession(data.user, nextSession);
      }
      return { success: true };
    } catch (error) {
      console.error('Change password error:', error);
      if (error instanceof Error) throw error;
      throw new Error('Could not update password.');
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setConnectionError(null);
    (async () => {
      try {
        await Promise.race([supabase.auth.signOut(), new Promise((resolve) => setTimeout(resolve, 6000))]);
      } catch (err) {
        console.error('Logout error:', err);
      }
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (_) {}
    })();
  };

  const clearConnectionError = () => setConnectionError(null);

  const value = {
    currentUser,
    login,
    signUp,
    logout,
    updateProfile,
    changePassword,
    refreshProfile,
    getAuthToken,
    loading,
    supabase,
    connectionError,
    clearConnectionError
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
