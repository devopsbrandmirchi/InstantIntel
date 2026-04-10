import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/requestWithTimeout';
import Modal from '../components/Modal';

const REQUEST_TIMEOUT_MS = 20000;
const CLIENTS_LOAD_TIMEOUT_MS = 40000;

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'editor', label: 'Editor' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'viewer', label: 'Viewer' }
];

// TEMPORARY: set to false to restore admin-only restriction for editing users
const TEMPORARY_ALLOW_ANY_USER_EDIT = true;

const UserManagement = () => {
  const { currentUser, signUp } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [rolesById, setRolesById] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [editForm, setEditForm] = useState({ full_name: '', role: 'viewer', assignedClientIds: [] });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    role: 'viewer'
  });
  const [sortBy, setSortBy] = useState('full_name');
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedProfileId, setExpandedProfileId] = useState(null);
  const [activeClients, setActiveClients] = useState([]);
  const [allClientsMap, setAllClientsMap] = useState({});
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const mountedRef = React.useRef(true);

  const isAdmin = (currentUser?.role || '').toLowerCase() === 'admin';
  const canManageUsers = isAdmin || TEMPORARY_ALLOW_ANY_USER_EDIT;

  useEffect(() => {
    mountedRef.current = true;
    if (canManageUsers) {
      loadRoles();
      loadProfiles();
      loadClients();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [canManageUsers]);

  const loadRoles = async () => {
    try {
      const { data, error } = await supabase.from('roles').select('id, name');
      if (error) throw error;
      const map = {};
      (data || []).forEach((r) => (map[r.name] = r.id));
      setRolesById(map);
    } catch (err) {
      console.error('Error loading roles:', err);
    }
  };

  const loadClients = async () => {
    try {
      const { data: allClients, error } = await withTimeout(
        supabase.from('clients').select('id, full_name, is_active').order('full_name'),
        CLIENTS_LOAD_TIMEOUT_MS,
        'Loading clients timed out. Try refreshing the page.'
      );
      if (error) throw error;
      const list = allClients || [];
      setAllClientsMap(Object.fromEntries(list.map((c) => [c.id, c.full_name || `Client #${c.id}`])));
      setActiveClients(list.filter((c) => c.is_active));
    } catch (err) {
      console.error('Error loading clients:', err);
      setActiveClients([]);
      setAllClientsMap({});
    }
  };

  const loadProfiles = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const { data: profileData, error: profileError } = await withTimeout(
        supabase
          .from('profiles')
          .select('id, email, full_name, clients, user_roles!user_id(role_id, roles(id, name))')
          .order('full_name'),
        REQUEST_TIMEOUT_MS,
        'Loading users timed out. Please refresh the page.'
      );

      if (profileError) {
        console.warn('Profiles with roles failed, trying profiles only:', profileError.message);
        const { data: profilesOnly, error: profilesOnlyError } = await withTimeout(
          supabase.from('profiles').select('id, email, full_name, clients').order('full_name'),
          REQUEST_TIMEOUT_MS
        );
        if (profilesOnlyError) throw profilesOnlyError;
        const { data: allUserRoles } = await withTimeout(
          supabase.from('user_roles').select('user_id, role_id, roles!role_id(id, name)'),
          REQUEST_TIMEOUT_MS
        );
        const rolesByUserId = {};
        (allUserRoles || []).forEach((ur) => {
          if (!rolesByUserId[ur.user_id]) rolesByUserId[ur.user_id] = [];
          rolesByUserId[ur.user_id].push(ur);
        });
        const merged = (profilesOnly || []).map((p) => ({
          ...p,
          user_roles: rolesByUserId[p.id] || []
        }));
        if (mountedRef.current) setProfiles(merged);
        return;
      }
      if (mountedRef.current) setProfiles(profileData || []);
    } catch (err) {
      console.error('Error loading profiles:', err);
      if (mountedRef.current) {
        setProfiles([]);
        setMessage({
          type: 'error',
          text: err?.message || 'Failed to load profiles. Try refreshing the page.'
        });
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const getPrimaryRole = (profile) => {
    const ur = profile.user_roles || [];
    const names = ur.map((r) => r.roles?.name).filter(Boolean);
    if (names.includes('admin')) return 'admin';
    return names[0] || 'viewer';
  };

  const searchLower = searchQuery.trim().toLowerCase();
  const filteredProfiles = !searchLower
    ? profiles
    : profiles.filter((p) => {
        const email = (p.email ?? '').toLowerCase();
        const name = (p.full_name ?? '').toLowerCase();
        return email.includes(searchLower) || name.includes(searchLower);
      });

  const handleSort = (column) => {
    if (sortBy === column) setSortAsc((a) => !a);
    else {
      setSortBy(column);
      setSortAsc(true);
    }
  };

  const sortedProfiles = [...filteredProfiles].sort((a, b) => {
    let va, vb;
    switch (sortBy) {
      case 'email':
        va = (a.email ?? '').toLowerCase();
        vb = (b.email ?? '').toLowerCase();
        break;
      case 'full_name':
        va = (a.full_name ?? '').toLowerCase();
        vb = (b.full_name ?? '').toLowerCase();
        break;
      case 'role':
        va = getPrimaryRole(a).toLowerCase();
        vb = getPrimaryRole(b).toLowerCase();
        break;
      default:
        return 0;
    }
    const cmp = va.localeCompare(vb);
    return sortAsc ? cmp : -cmp;
  });

  const openAddModal = () => {
    setFormData({ email: '', password: '', confirmPassword: '', full_name: '', role: 'viewer' });
    setMessage({ type: '', text: '' });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
  };

  const openEditModal = (profile, e) => {
    if (e) e.stopPropagation();
    setEditingProfile(profile);
    setClientSearchQuery('');
    const clientIds = profile.clients != null && Array.isArray(profile.clients) ? profile.clients : [];
    setEditForm({
      full_name: profile.full_name ?? '',
      role: getPrimaryRole(profile),
      assignedClientIds: [...clientIds]
    });
    setMessage({ type: '', text: '' });
    setEditModalOpen(true);
  };

  const toggleClientAssignment = (clientId) => {
    setEditForm((prev) => {
      const ids = prev.assignedClientIds || [];
      const next = ids.includes(clientId) ? ids.filter((id) => id !== clientId) : [...ids, clientId];
      return { ...prev, assignedClientIds: next };
    });
  };

  const toggleExpandProfile = (profileId) => {
    setExpandedProfileId((prev) => (prev === profileId ? null : profileId));
  };

  const getAssignedClientNames = (profile) => {
    const ids = profile.clients != null && Array.isArray(profile.clients) ? profile.clients : [];
    return ids.map((id) => allClientsMap[id] ?? `Client #${id}`);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditingProfile(null);
    setClientSearchQuery('');
  };

  const setUserRoleInDb = async (userId, roleName) => {
    const roleId = rolesById[roleName];
    if (roleId == null) return;
    await supabase.from('user_roles').delete().eq('user_id', userId);
    await supabase.from('user_roles').insert({ user_id: userId, role_id: roleId });
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    if (formData.password !== formData.confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' });
      return;
    }
    if (formData.password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.full_name || '',
            name: formData.full_name || '',
            role: formData.role
          }
        }
      });
      if (error) throw error;
      if (data?.user?.id && formData.role) {
        await setUserRoleInDb(data.user.id, formData.role);
      }
      setMessage({
        type: 'success',
        text: 'User created. They can sign in with this email and password.'
      });
      setFormData({ email: '', password: '', confirmPassword: '', full_name: '', role: 'viewer' });
      await loadProfiles();
      setTimeout(() => closeModal(), 1500);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to create user.' });
    } finally {
      setSaving(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingProfile) return;
    setMessage({ type: '', text: '' });
    setSaving(true);
    try {
      const clientIds = editForm.assignedClientIds ?? [];
      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          full_name: editForm.full_name.trim() || null,
          clients: clientIds.length ? clientIds : []
        })
        .eq('id', editingProfile.id);
      if (profileError) throw profileError;
      await setUserRoleInDb(editingProfile.id, editForm.role);
      setMessage({ type: 'success', text: 'Profile updated successfully.' });
      await loadProfiles();
      setTimeout(() => closeEditModal(), 1200);
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to update profile.' });
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/60 min-h-0 h-7';

  if (!canManageUsers) {
    return (
      <div className="bg-white rounded shadow-md p-4 text-xs">
        <p className="text-gray-600">You need admin access to manage users.</p>
      </div>
    );
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';
  const supabaseUsersUrl = projectRef
    ? `https://supabase.com/dashboard/project/${projectRef}/auth/users`
    : 'https://supabase.com/dashboard';

  return (
    <div className="bg-white rounded shadow-md p-4 text-xs">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3">
        <h2 className="text-base font-bold text-gray-800">User Management</h2>
        <div className="flex flex-col xs:flex-row gap-2 sm:gap-3 sm:items-center">
          <div className="relative flex-1 sm:w-56">
            <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users..."
              className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/60"
            />
          </div>
          <a
            href={supabaseUsersUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-3 py-1.5 text-xs rounded border border-gray-300 text-gray-700 hover:bg-gray-50 whitespace-nowrap"
          >
            <i className="fas fa-external-link-alt mr-1.5"></i>Supabase Users
          </a>
          <button
            type="button"
            onClick={openAddModal}
            className="bg-brand-navy text-white px-3 py-1.5 text-xs rounded hover:bg-brand-navy-light transition duration-200 whitespace-nowrap"
          >
            <i className="fas fa-user-plus mr-1.5"></i>Add User
          </button>
        </div>
      </div>

      <p className="text-gray-600 mb-3">
        View and manage user profiles. New users get the role you choose; you can change name and role with Edit.
      </p>

      {message.text && (
        <div
          className={`mb-3 px-3 py-2 rounded text-sm flex flex-wrap items-center justify-between gap-2 ${
            message.type === 'error'
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-green-50 border border-green-200 text-green-800'
          }`}
        >
          <span>{message.text}</span>
          {message.type === 'error' && (
            <button
              type="button"
              onClick={() => {
                setMessage({ type: '', text: '' });
                loadProfiles();
                loadClients();
              }}
              className="px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-100 text-xs"
            >
              Retry
            </button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        {loading ? (
          <p className="text-gray-500 py-4">Loading users...</p>
        ) : (
          <table className="min-w-full table-auto text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-8 px-2 py-1.5"></th>
                <th
                  className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('email')}
                >
                  <span className="inline-flex items-center gap-1">
                    Email
                    {sortBy === 'email' && <i className={`fas fa-caret-${sortAsc ? 'up' : 'down'} text-[10px]`} />}
                  </span>
                </th>
                <th
                  className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('full_name')}
                >
                  <span className="inline-flex items-center gap-1">
                    Full name
                    {sortBy === 'full_name' && <i className={`fas fa-caret-${sortAsc ? 'up' : 'down'} text-[10px]`} />}
                  </span>
                </th>
                <th
                  className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('role')}
                >
                  <span className="inline-flex items-center gap-1">
                    Role
                    {sortBy === 'role' && <i className={`fas fa-caret-${sortAsc ? 'up' : 'down'} text-[10px]`} />}
                  </span>
                </th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedProfiles.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-2 py-4 text-center text-gray-500">
                    {profiles.length === 0
                      ? 'No user profiles found. Click "Add User" to create one.'
                      : 'No users match your search.'}
                  </td>
                </tr>
              ) : (
                sortedProfiles.map((profile) => (
                  <React.Fragment key={profile.id}>
                    <tr
                      className={`cursor-pointer ${expandedProfileId === profile.id ? 'bg-brand-mint/15' : 'hover:bg-gray-50'}`}
                      onClick={() => toggleExpandProfile(profile.id)}
                    >
                      <td className="px-2 py-1.5">
                        <i
                          className={`fas fa-chevron-${expandedProfileId === profile.id ? 'down' : 'right'} text-gray-400`}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-gray-900">{profile.email || '—'}</td>
                      <td className="px-2 py-1.5 text-gray-700">{profile.full_name || '—'}</td>
                      <td className="px-2 py-1.5">
                        <span className="capitalize text-gray-700">{getPrimaryRole(profile)}</span>
                      </td>
                      <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => openEditModal(profile, e)}
                          className="text-brand-teal hover:text-brand-navy"
                          title="Edit"
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                      </td>
                    </tr>
                    {expandedProfileId === profile.id && (
                      <tr>
                        <td colSpan="5" className="px-2 py-2 bg-gray-50 align-top">
                          <div className="text-gray-600 font-medium mb-1">
                            Assigned clients ({getAssignedClientNames(profile).length})
                          </div>
                          {getAssignedClientNames(profile).length === 0 ? (
                            <p className="text-gray-500 text-xs">No clients assigned.</p>
                          ) : (
                            <ul className="text-xs text-gray-700 list-disc list-inside">
                              {getAssignedClientNames(profile).map((name, i) => (
                                <li key={i}>{name}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal} title="Create new user">
        <form onSubmit={handleAddSubmit} className="space-y-2 text-xs">
          {message.text && (
            <div
              className={`px-3 py-2 rounded text-sm ${
                message.type === 'error'
                  ? 'bg-red-50 border border-red-200 text-red-700'
                  : 'bg-green-50 border border-green-200 text-green-800'
              }`}
            >
              {message.text}
            </div>
          )}
          <div>
            <label className="block font-medium text-gray-700 mb-1">Full name</label>
            <input
              type="text"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              className={inputClass}
              placeholder="Display name"
            />
          </div>
          <div>
            <label className="block font-medium text-gray-700 mb-1">Email *</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className={inputClass}
              placeholder="user@example.com"
              required
            />
          </div>
          <div>
            <label className="block font-medium text-gray-700 mb-1">Password *</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className={inputClass}
              placeholder="Min 6 characters"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="block font-medium text-gray-700 mb-1">Confirm password *</label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              className={inputClass}
              placeholder="Confirm password"
              required
              minLength={6}
            />
          </div>
          <div>
            <label className="block font-medium text-gray-700 mb-1">Role</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className={inputClass}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button type="button" onClick={closeModal} className="px-3 py-1.5 border border-gray-300 rounded text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 bg-brand-navy text-white rounded hover:bg-brand-navy-light disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create user'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={editModalOpen} onClose={closeEditModal} title="Edit user profile">
        <form onSubmit={handleEditSubmit} className="space-y-2 text-xs">
          {message.text && (
            <div
              className={`px-3 py-2 rounded text-sm ${
                message.type === 'error'
                  ? 'bg-red-50 border border-red-200 text-red-700'
                  : 'bg-green-50 border border-green-200 text-green-800'
              }`}
            >
              {message.text}
            </div>
          )}
          {editingProfile && (
            <>
              <div>
                <label className="block font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={editingProfile.email ?? ''}
                  readOnly
                  className="w-full px-2 py-1 text-xs border border-gray-200 rounded bg-gray-50 min-h-0 h-7"
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-1">Full name</label>
                <input
                  type="text"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                  className={inputClass}
                  placeholder="Display name"
                />
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                  className={inputClass}
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-gray-700 mb-1">Assigned clients</label>
                <p className="text-gray-500 mb-1.5 text-[11px]">Select active clients this user can access.</p>
                <div className="relative mb-1.5">
                  <i className="fas fa-search absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                  <input
                    type="text"
                    value={clientSearchQuery}
                    onChange={(e) => setClientSearchQuery(e.target.value)}
                    placeholder="Search clients..."
                    className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/60 bg-white"
                  />
                </div>
                <div className="max-h-32 overflow-y-auto border border-gray-200 rounded p-2 bg-gray-50 space-y-1">
                  {activeClients.length === 0 ? (
                    <p className="text-gray-500 text-[11px]">No active clients. Add clients in Client Master.</p>
                  ) : (() => {
                    const q = clientSearchQuery.trim().toLowerCase();
                    const filtered = q
                      ? activeClients.filter(
                          (c) =>
                            (c.full_name || '')
                              .toLowerCase()
                              .includes(q) || String(c.id).includes(q)
                        )
                      : activeClients;
                    return filtered.length === 0 ? (
                      <p className="text-gray-500 text-[11px]">No clients match &quot;{clientSearchQuery}&quot;</p>
                    ) : (
                      filtered.map((client) => (
                        <label key={client.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(editForm.assignedClientIds || []).includes(client.id)}
                            onChange={() => toggleClientAssignment(client.id)}
                            className="rounded"
                          />
                          <span className="text-gray-700">{client.full_name || `Client #${client.id}`}</span>
                        </label>
                      ))
                    );
                  })()}
                </div>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={closeEditModal}
              className="px-3 py-1.5 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 bg-brand-navy text-white rounded hover:bg-brand-navy-light disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Update profile'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default UserManagement;
