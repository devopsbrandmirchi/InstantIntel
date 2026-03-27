import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
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
    role: metadata.role || 'viewer', // fallback; real role comes from user_roles table
    token: session?.access_token ?? null,
    refreshToken: session?.refresh_token ?? null
  };
}

function normalizeClientIds(raw) {
  if (raw == null) return [];
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      arr = raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  } else if (typeof raw === 'object') {
    if (Array.isArray(raw.ids)) arr = raw.ids;
  }
  return [...new Set(arr.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0))];
}

const ROLE_FETCH_TIMEOUT_MS = 25000;
const SESSION_LOAD_TIMEOUT_MS = 25000;

const ROLE_RPC_TIMEOUT_MS = 8000;

const ROLE_FETCH_OUTER_ATTEMPTS = 4;
const ROLE_FETCH_BACKOFF_MS = 400;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Single attempt: RPC first, then table-query fallback (with inner retries). */
async function fetchUserRoleFromDbOnce(userId, tableFallbackRetries = 2) {
  try {
    const { data: roleName, error } = await withTimeout(
      supabase.rpc('get_my_role'),
      ROLE_RPC_TIMEOUT_MS,
      'Role fetch timeout'
    );
    if (!error && roleName != null && String(roleName).trim()) return String(roleName).toLowerCase();
  } catch (err) {
    console.warn('get_my_role RPC failed, trying table query:', err?.message);
  }

  const timeout = 12000;
  for (let attempt = 1; attempt <= tableFallbackRetries; attempt++) {
    try {
      const { data: urData, error: urError } = await withTimeout(
        supabase.from('user_roles').select('role_id').eq('user_id', userId),
        timeout,
        'Role fetch timeout'
      );
      if (urError || !urData?.length) return null;
      const roleIds = [...new Set(urData.map((r) => r.role_id).filter(Boolean))];
      if (roleIds.length === 0) return null;
      const { data: rolesData, error: rolesError } = await withTimeout(
        supabase.from('roles').select('id, name').in('id', roleIds),
        timeout,
        'Roles fetch timeout'
      );
      if (rolesError || !rolesData?.length) return null;
      const roleNames = rolesData.map((r) => r.name).filter(Boolean);
      if (roleNames.some((n) => String(n).toLowerCase() === 'admin')) return 'admin';
      return roleNames[0] ? String(roleNames[0]).toLowerCase() : null;
    } catch (err) {
      if (attempt === tableFallbackRetries) {
        console.warn('Could not fetch user role:', err?.message);
        return null;
      }
    }
  }
  return null;
}

/** Prefer RPC get_my_role(); retry whole flow on transient failures. */
async function fetchUserRoleFromDb(userId) {
  for (let attempt = 1; attempt <= ROLE_FETCH_OUTER_ATTEMPTS; attempt++) {
    const role = await fetchUserRoleFromDbOnce(userId);
    if (role != null) return role;
    if (attempt < ROLE_FETCH_OUTER_ATTEMPTS) {
      const wait = ROLE_FETCH_BACKOFF_MS * Math.pow(2, attempt - 1);
      console.warn(`Role fetch attempt ${attempt}/${ROLE_FETCH_OUTER_ATTEMPTS} returned no role; retrying in ${wait}ms`);
      await delay(wait);
    }
  }
  return null;
}

async function fetchAssignedClientIds(userId) {
  try {
    const { data, error } = await withTimeout(
      supabase.from('profiles').select('clients').eq('id', userId).single(),
      10000,
      'Assigned clients fetch timeout'
    );
    if (error) return [];
    return normalizeClientIds(data?.clients);
  } catch {
    return [];
  }
}

const CONNECTION_ERROR_MESSAGE = 'Unable to connect. Please check your network and refresh.';

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);
  const [connectionError, setConnectionError] = useState(null);
  /** After first successful session hydrate, later auth refreshes show "Reconnecting…". */
  const sessionEstablishedRef = useRef(false);

  const setUserWithRole = async (supabaseUser, session) => {
    const showReconnecting = sessionEstablishedRef.current && !!supabaseUser;
    if (showReconnecting) setReconnecting(true);
    try {
      const baseUser = mapSupabaseUser(supabaseUser, session);
      let roleFromDb = null;
      let assignedClientIds = [];
      try {
        roleFromDb = await fetchUserRoleFromDb(supabaseUser.id);
      } catch (err) {
        console.warn('Role fetch failed or timed out, using fallback:', err?.message);
      }
      try {
        assignedClientIds = await fetchAssignedClientIds(supabaseUser.id);
      } catch (err) {
        console.warn('Assigned clients fetch failed, using empty list:', err?.message);
      }
      setCurrentUser((prev) => {
        const previousRoleForSameUser =
          prev?.id === supabaseUser.id && prev?.role ? String(prev.role).toLowerCase() : null;
        const role = (roleFromDb || previousRoleForSameUser || baseUser.role || '').toLowerCase() || 'viewer';
        return {
          ...baseUser,
          role,
          assignedClientIds
        };
      });
      sessionEstablishedRef.current = true;
    } finally {
      if (showReconnecting) setReconnecting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const initSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session?.user) {
          await setUserWithRole(session.user, session);
          if (!cancelled) setConnectionError(null);
        } else {
          setCurrentUser(null);
          sessionEstablishedRef.current = false;
          if (!cancelled) setConnectionError(null);
        }
      } catch (err) {
        console.warn('Auth initial load failed:', err?.message);
        if (!cancelled) {
          setCurrentUser(null);
          sessionEstablishedRef.current = false;
          setConnectionError(err?.message || CONNECTION_ERROR_MESSAGE);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    initSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (cancelled) return;
      try {
        if (session?.user) {
          await setUserWithRole(session.user, session);
          if (!cancelled) setConnectionError(null);
        } else {
          setCurrentUser(null);
          sessionEstablishedRef.current = false;
          if (!cancelled) setConnectionError(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
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
        await setUserWithRole(data.user, data.session);
        // Best-effort login audit log: never block login success.
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
      const { full_name, name, phone } = updates;
      const dataToSet = {};
      if (full_name !== undefined) dataToSet.full_name = full_name;
      if (name !== undefined) dataToSet.name = name;
      if (full_name !== undefined && !dataToSet.name) dataToSet.name = full_name;
      if (phone !== undefined) dataToSet.phone = phone;

      const { data, error } = await supabase.auth.updateUser({ data: dataToSet });

      if (error) throw new Error(error.message);
      if (data?.user && data?.session) {
        await setUserWithRole(data.user, data.session);
        return { success: true };
      }
      throw new Error('Update failed.');
    } catch (error) {
      console.error('Update profile error:', error);
      if (error instanceof Error) throw error;
      throw new Error('Failed to update profile.');
    }
  };

  /** Clear session in UI immediately; sign out on server in background (signOut can hang on bad network). */
  const logout = () => {
    setCurrentUser(null);
    sessionEstablishedRef.current = false;
    setReconnecting(false);
    setConnectionError(null);
    (async () => {
      try {
        await Promise.race([
          supabase.auth.signOut(),
          new Promise((resolve) => setTimeout(resolve, 6000))
        ]);
      } catch (err) {
        console.error('Logout error:', err);
      }
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (_) {
        /* ensure local session cleared if global signOut hung */
      }
    })();
  };

  const clearConnectionError = () => setConnectionError(null);

  const value = {
    currentUser,
    login,
    signUp,
    logout,
    updateProfile,
    getAuthToken,
    loading,
    reconnecting,
    supabase,
    connectionError,
    clearConnectionError
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
