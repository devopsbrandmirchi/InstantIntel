import { createClient } from '@supabase/supabase-js';

/**
 * Validates Supabase JWT and ensures the user has role "admin" (via user_roles + roles).
 * Used by Vercel serverless routes that proxy to the scraper bridge.
 */
export async function requireAdmin(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (!authHeader || !String(authHeader).startsWith('Bearer ')) {
    return { error: 'Unauthorized', status: 401 };
  }
  const token = String(authHeader).slice(7).trim();
  if (!token) return { error: 'Unauthorized', status: 401 };

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return { error: 'Server misconfigured: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY', status: 500 };
  }

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
