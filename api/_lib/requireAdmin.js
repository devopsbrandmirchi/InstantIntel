import { createClient } from '@supabase/supabase-js';

/**
 * Validates Supabase JWT and ensures the user is admin.
 *
 * 1) Preferred: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (checks user_roles + roles).
 * 2) Fallback: SUPABASE_URL or VITE_SUPABASE_URL, plus SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY,
 *    then RPC get_my_role() as the user (same pattern as the React app).
 */
export async function requireAdmin(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !String(authHeader).startsWith('Bearer ')) {
    return { error: 'Unauthorized', status: 401 };
  }
  const token = String(authHeader).slice(7).trim();
  if (!token) return { error: 'Unauthorized', status: 401 };

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url) {
    return {
      error: 'Server misconfigured: set SUPABASE_URL or VITE_SUPABASE_URL on Vercel.',
      status: 500
    };
  }

  if (serviceKey) {
    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const {
      data: { user },
      error: userErr
    } = await supabase.auth.getUser(token);
    if (userErr || !user) {
      return { error: 'Invalid or expired session', status: 401 };
    }

    const { data: urRows, error: urErr } = await supabase.from('user_roles').select('role_id').eq('user_id', user.id);
    if (urErr || !urRows?.length) {
      return { error: 'Forbidden', status: 403 };
    }
    const roleIds = [...new Set(urRows.map((r) => r.role_id).filter(Boolean))];
    if (roleIds.length === 0) return { error: 'Forbidden', status: 403 };

    const { data: roles, error: rolesErr } = await supabase.from('roles').select('name').in('id', roleIds);
    if (rolesErr || !roles?.length) {
      return { error: 'Forbidden', status: 403 };
    }
    const isAdmin = roles.some((r) => String(r.name || '').toLowerCase() === 'admin');
    if (!isAdmin) {
      return { error: 'Admin only', status: 403 };
    }

    return { user };
  }

  if (!anonKey) {
    return {
      error:
        'Server misconfigured: add SUPABASE_SERVICE_ROLE_KEY on Vercel, or ensure VITE_SUPABASE_ANON_KEY is set and get_my_role RPC exists.',
      status: 500
    };
  }

  const supabaseUser = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` }
    }
  });

  const {
    data: { user },
    error: userErr
  } = await supabaseUser.auth.getUser(token);
  if (userErr || !user) {
    return { error: 'Invalid or expired session', status: 401 };
  }

  const { data: roleName, error: rpcErr } = await supabaseUser.rpc('get_my_role');
  if (rpcErr) {
    return {
      error:
        'Could not verify role. Add SUPABASE_SERVICE_ROLE_KEY on Vercel, or fix get_my_role RPC for this user.',
      status: 403
    };
  }
  const role = String(roleName || '')
    .trim()
    .toLowerCase();
  if (role !== 'admin') {
    return { error: 'Admin only', status: 403 };
  }

  return { user };
}
