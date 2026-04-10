import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/requestWithTimeout';
import Modal from '../components/Modal';

const REQUEST_TIMEOUT_MS = 20000;

const Roles = () => {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const loadRoles = async () => {
    setError(null);
    try {
      const { data, error: err } = await withTimeout(
        supabase.from('roles').select('id, name, description, created_at').order('name'),
        REQUEST_TIMEOUT_MS,
        'Loading roles timed out. Please refresh.'
      );
      if (err) throw err;
      setRoles(data || []);
    } catch (err) {
      console.error('Error loading roles:', err);
      setRoles([]);
      setError(err?.message || 'Failed to load roles.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoles();
  }, []);

  const openAddModal = () => {
    setEditingId(null);
    setFormData({ name: '', description: '' });
    setMessage({ type: '', text: '' });
    setModalOpen(true);
  };

  const openEditModal = (role) => {
    setEditingId(role.id);
    setFormData({
      name: role.name || '',
      description: role.description || ''
    });
    setMessage({ type: '', text: '' });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      if (editingId) {
        const { error: err } = await withTimeout(
          supabase.from('roles').update({
            name: formData.name.trim(),
            description: (formData.description || '').trim()
          }).eq('id', editingId),
          REQUEST_TIMEOUT_MS,
          'Update timed out.'
        );
        if (err) throw err;
        setMessage({ type: 'success', text: 'Role updated successfully.' });
      } else {
        const { error: err } = await withTimeout(
          supabase.from('roles').insert({
            name: formData.name.trim(),
            description: (formData.description || '').trim()
          }),
          REQUEST_TIMEOUT_MS,
          'Create timed out.'
        );
        if (err) throw err;
        setMessage({ type: 'success', text: 'Role created successfully.' });
      }
      await loadRoles();
      setTimeout(() => closeModal(), 1200);
    } catch (err) {
      console.error('Error saving role:', err);
      setMessage({ type: 'error', text: err?.message || 'Failed to save role.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (roleId) => {
    if (!confirm('Are you sure you want to delete this role? Users with this role will need to be reassigned.')) return;
    try {
      const { error: err } = await withTimeout(
        supabase.from('roles').delete().eq('id', roleId),
        REQUEST_TIMEOUT_MS,
        'Delete timed out.'
      );
      if (err) throw err;
      await loadRoles();
      setMessage({ type: 'success', text: 'Role deleted.' });
      setTimeout(() => setMessage({ type: '', text: '' }), 2000);
    } catch (err) {
      console.error('Error deleting role:', err);
      setMessage({ type: 'error', text: err?.message || 'Failed to delete role. It may be in use.' });
    }
  };

  const inputClass = 'w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/60 min-h-0 h-7';

  return (
    <div className="bg-white rounded shadow-md p-4 text-xs">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-base font-bold text-gray-800">Role Management</h2>
        <button
          type="button"
          onClick={openAddModal}
          className="bg-brand-navy text-white px-3 py-1.5 text-xs rounded hover:bg-brand-navy-light transition duration-200"
        >
          <i className="fas fa-plus mr-1.5"></i>Add Role
        </button>
      </div>

      {message.text && (
        <div className={`mb-3 px-3 py-2 rounded text-sm ${message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'}`}>
          {message.text}
        </div>
      )}

      {error && (
        <div className="mb-3 px-3 py-2 rounded bg-red-50 text-red-700 text-sm flex items-center justify-between gap-2">
          {error}
          <button type="button" onClick={loadRoles} className="text-brand-teal hover:underline font-medium">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 py-4">Loading roles...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase">Role Name</th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase">Description</th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {roles.length === 0 ? (
                <tr>
                  <td colSpan="3" className="px-2 py-2 text-center text-gray-500">
                    No roles found. Click &quot;Add Role&quot; to create one.
                  </td>
                </tr>
              ) : (
                roles.map((role) => (
                  <tr key={role.id}>
                    <td className="px-2 py-1.5 text-gray-900">{role.name || ''}</td>
                    <td className="px-2 py-1.5 text-gray-700">{role.description || ''}</td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => openEditModal(role)}
                        className="text-brand-teal hover:text-brand-navy mr-2"
                        title="Edit"
                      >
                        <i className="fas fa-edit"></i>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(role.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingId ? 'Edit Role' : 'Add New Role'}
      >
        <form onSubmit={handleSubmit} className="space-y-2 text-xs">
          <div>
            <label className="block font-medium text-gray-700 mb-1">Role Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="block font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/60"
            />
          </div>
          <div className="flex justify-end gap-2 pt-3">
            <button
              type="button"
              onClick={closeModal}
              className="px-3 py-1.5 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 bg-brand-navy text-white rounded hover:bg-brand-navy-light disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Roles;
