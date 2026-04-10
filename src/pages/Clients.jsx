import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/requestWithTimeout';
import Modal from '../components/Modal';

const REQUEST_TIMEOUT_MS = 20000;
const CLIENTS_LOAD_TIMEOUT_MS = 45000;

const defaultClientForm = () => ({
  full_name: '',
  dealer_type: '',
  address: '',
  website: '',
  account_exe: '',
  digital_lead: '',
  google_ads_id: '',
  google_analytics_id: '',
  inventory_api: '',
  active_pull: false,
  parent_client: '',
  is_active: false,
  dealership_name: '',
  scrap_feed: false,
  ga4_account_email_id: '',
  page_type_logic_id: 0
});

const defaultLocationRow = () => ({
  id: null,
  location_name: '',
  address: '',
  street: '',
  city: '',
  state: '',
  country: '',
  zip: '',
  website: '',
  latitude: '',
  longitude: ''
});

const Clients = () => {
  const [clients, setClients] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(defaultClientForm());
  const [locations, setLocations] = useState([defaultLocationRow()]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [sortBy, setSortBy] = useState('full_name');
  const [sortAsc, setSortAsc] = useState(true);
  const [togglingId, setTogglingId] = useState(null);
  const mountedRef = React.useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    loadClients();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const searchLower = searchQuery.trim().toLowerCase();
  const filteredBySearch =
    !searchLower
      ? clients
      : clients.filter((c) => {
          const name = (c.full_name ?? '').toLowerCase();
          const dealer = (c.dealer_type ?? '').toLowerCase();
          const web = (c.website ?? '').toLowerCase();
          const dealerName = (c.dealership_name ?? '').toLowerCase();
          const addr = (c.address ?? '').toLowerCase();
          const accountExe = (c.account_exe ?? '').toLowerCase();
          const digitalLead = (c.digital_lead ?? '').toLowerCase();
          const parent = (c.parent_client ?? '').toLowerCase();
          return (
            name.includes(searchLower) ||
            dealer.includes(searchLower) ||
            web.includes(searchLower) ||
            dealerName.includes(searchLower) ||
            addr.includes(searchLower) ||
            accountExe.includes(searchLower) ||
            digitalLead.includes(searchLower) ||
            parent.includes(searchLower)
          );
        });

  const filteredClients =
    activeFilter === 'all'
      ? filteredBySearch
      : activeFilter === 'active'
        ? filteredBySearch.filter((c) => c.is_active)
        : filteredBySearch.filter((c) => !c.is_active);

  const handleSort = (column) => {
    if (sortBy === column) setSortAsc((a) => !a);
    else {
      setSortBy(column);
      setSortAsc(true);
    }
  };

  const sortedClients = [...filteredClients].sort((a, b) => {
    let va, vb;
    switch (sortBy) {
      case 'full_name':
        va = (a.full_name ?? '').toLowerCase();
        vb = (b.full_name ?? '').toLowerCase();
        break;
      case 'dealer_type':
        va = (a.dealer_type ?? '').toLowerCase();
        vb = (b.dealer_type ?? '').toLowerCase();
        break;
      case 'website':
        va = (a.website ?? '').toLowerCase();
        vb = (b.website ?? '').toLowerCase();
        break;
      case 'is_active':
        va = a.is_active ? 1 : 0;
        vb = b.is_active ? 1 : 0;
        return sortAsc ? va - vb : vb - va;
      default:
        return 0;
    }
    const cmp = va.localeCompare(vb);
    return sortAsc ? cmp : -cmp;
  });

  const loadClients = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('clients')
          .select('*, client_locations(*)')
          .order('full_name', { ascending: true }),
        CLIENTS_LOAD_TIMEOUT_MS,
        'Loading clients timed out. Click Retry or refresh the page.'
      );
      if (error) throw error;
      if (mountedRef.current) setClients(data || []);
    } catch (err) {
      console.error('Error loading clients:', err);
      if (mountedRef.current) {
        setClients([]);
        setMessage({
          type: 'error',
          text: err?.message || 'Failed to load clients. Try refreshing the page.'
        });
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData(defaultClientForm());
    setLocations([defaultLocationRow()]);
    setMessage({ type: '', text: '' });
    setModalOpen(true);
  };

  const openEditModal = async (client) => {
    setMessage({ type: '', text: '' });
    setEditingId(client.id);
    setFormData({
      full_name: client.full_name ?? '',
      dealer_type: client.dealer_type ?? '',
      address: client.address ?? '',
      website: client.website ?? '',
      account_exe: client.account_exe ?? '',
      digital_lead: client.digital_lead ?? '',
      google_ads_id: client.google_ads_id ?? '',
      google_analytics_id: client.google_analytics_id ?? '',
      inventory_api: client.inventory_api ?? '',
      active_pull: !!client.active_pull,
      parent_client: client.parent_client ?? '',
      is_active: !!client.is_active,
      dealership_name: client.dealership_name ?? '',
      scrap_feed: !!client.scrap_feed,
      ga4_account_email_id: client.ga4_account_email_id ?? '',
      page_type_logic_id: client.page_type_logic_id ?? 0
    });
    const locs = (client.client_locations || []).map((loc) => ({
      id: loc.id,
      location_name: loc.location_name ?? '',
      address: loc.address ?? '',
      street: loc.street ?? '',
      city: loc.city ?? '',
      state: loc.state ?? '',
      country: loc.country ?? '',
      zip: loc.zip ?? '',
      website: loc.website ?? '',
      latitude: loc.latitude ?? '',
      longitude: loc.longitude ?? ''
    }));
    setLocations(locs.length ? locs : [defaultLocationRow()]);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };

  const updateClientField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const updateLocation = (index, field, value) => {
    setLocations((prev) =>
      prev.map((loc, i) => (i === index ? { ...loc, [field]: value } : loc))
    );
  };

  const addLocationRow = () => {
    setLocations((prev) => [...prev, defaultLocationRow()]);
  };

  const removeLocationRow = (index) => {
    setLocations((prev) => prev.filter((_, i) => i !== index));
  };

  const hasLocationData = (loc) =>
    [loc.location_name, loc.address, loc.street, loc.city, loc.state, loc.country, loc.zip, loc.website].some(
      (v) => String(v).trim() !== ''
    );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    setSaving(true);
    try {
      const clientPayload = {
        full_name: formData.full_name.trim() || '',
        dealer_type: formData.dealer_type.trim() || '',
        address: formData.address.trim() || null,
        website: formData.website.trim() || '',
        account_exe: formData.account_exe.trim() || '',
        digital_lead: formData.digital_lead.trim() || '',
        google_ads_id: formData.google_ads_id.trim() || null,
        google_analytics_id: formData.google_analytics_id.trim() || null,
        inventory_api: formData.inventory_api.trim() || null,
        active_pull: !!formData.active_pull,
        parent_client: formData.parent_client.trim() || '',
        is_active: !!formData.is_active,
        dealership_name: formData.dealership_name.trim() || null,
        scrap_feed: !!formData.scrap_feed,
        ga4_account_email_id: formData.ga4_account_email_id.trim() || null,
        page_type_logic_id: Number(formData.page_type_logic_id) || 0
      };

      if (editingId) {
        const { error: updateError } = await supabase
          .from('clients')
          .update(clientPayload)
          .eq('id', editingId);
        if (updateError) throw updateError;

        const toInsert = locations.filter(hasLocationData).filter((loc) => !loc.id);
        const toUpdate = locations.filter(hasLocationData).filter((loc) => loc.id);
        const existingIds = toUpdate.map((l) => l.id);

        const { data: existing } = await supabase
          .from('client_locations')
          .select('id')
          .eq('client_id', editingId);
        const toDelete = (existing || []).filter((row) => !existingIds.includes(row.id)).map((r) => r.id);
        for (const id of toDelete) {
          await supabase.from('client_locations').delete().eq('id', id);
        }
        for (const loc of toUpdate) {
          await supabase
            .from('client_locations')
            .update({
              location_name: loc.location_name || '',
              address: loc.address || '',
              street: loc.street || '',
              city: loc.city || '',
              state: loc.state || '',
              country: loc.country || '',
              zip: loc.zip || '',
              website: loc.website || '',
              latitude: loc.latitude || '',
              longitude: loc.longitude || ''
            })
            .eq('id', loc.id);
        }
        for (const loc of toInsert) {
          await supabase.from('client_locations').insert({
            client_id: editingId,
            location_name: loc.location_name || '',
            address: loc.address || '',
            street: loc.street || '',
            city: loc.city || '',
            state: loc.state || '',
            country: loc.country || '',
            zip: loc.zip || '',
            website: loc.website || '',
            latitude: loc.latitude || '',
            longitude: loc.longitude || ''
          });
        }
        setMessage({ type: 'success', text: 'Client updated successfully.' });
      } else {
        const { data: newClient, error: insertError } = await supabase
          .from('clients')
          .insert(clientPayload)
          .select('id')
          .single();
        if (insertError) throw insertError;
        const clientId = newClient?.id;
        if (clientId) {
          for (const loc of locations.filter(hasLocationData)) {
            await supabase.from('client_locations').insert({
              client_id: clientId,
              location_name: loc.location_name || '',
              address: loc.address || '',
              street: loc.street || '',
              city: loc.city || '',
              state: loc.state || '',
              country: loc.country || '',
              zip: loc.zip || '',
              website: loc.website || '',
              latitude: loc.latitude || '',
              longitude: loc.longitude || ''
            });
          }
        }
        setMessage({ type: 'success', text: 'Client created successfully.' });
      }
      await loadClients();
      setTimeout(() => {
        closeModal();
      }, 1200);
    } catch (err) {
      console.error('Error saving client:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to save client.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (clientId) => {
    if (!window.confirm('Are you sure you want to delete this client? Locations will be unlinked.')) return;
    try {
      const { error } = await supabase.from('clients').delete().eq('id', clientId);
      if (error) throw error;
      await loadClients();
      setExpandedId((id) => (id === clientId ? null : id));
    } catch (err) {
      console.error('Error deleting client:', err);
      alert(err.message || 'Failed to delete client.');
    }
  };

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const toggleClientActive = async (client, e) => {
    e?.stopPropagation();
    const newActive = !client.is_active;
    setTogglingId(client.id);
    setMessage({ type: '', text: '' });
    try {
      const { error } = await supabase.from('clients').update({ is_active: newActive }).eq('id', client.id);
      if (error) throw error;
      setMessage({
        type: 'success',
        text: `${client.full_name || 'Client'} is now ${newActive ? 'Active' : 'Inactive'}.`
      });
      await loadClients();
      setTimeout(() => setMessage({ type: '', text: '' }), 3000);
    } catch (err) {
      console.error('Error toggling client active:', err);
      setMessage({
        type: 'error',
        text: err?.message || 'Failed to update status. You may not have permission to update clients.'
      });
    } finally {
      setTogglingId(null);
    }
  };

  const inputClass =
    'w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/60 min-h-0 h-7';
  const labelClass = 'block font-medium text-gray-700 mb-1';

  return (
    <div className="bg-white rounded shadow-md p-4 text-xs">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3">
        <div>
          <h2 className="text-base font-bold text-gray-800">Client Master</h2>
          {!loading && (
            <p className="text-xs text-gray-500 mt-1">
              Displaying{' '}
              <span className="font-semibold text-gray-700 tabular-nums">{sortedClients.length}</span>
              {clients.length > 0 && sortedClients.length !== clients.length ? (
                <>
                  {' '}
                  of <span className="font-semibold text-gray-700 tabular-nums">{clients.length}</span>
                </>
              ) : null}{' '}
              {sortedClients.length === 1 ? 'client' : 'clients'}
              {searchLower || activeFilter !== 'all' ? (
                <span className="text-gray-400"> (search / status filter applied)</span>
              ) : null}
            </p>
          )}
        </div>
        <div className="flex flex-col xs:flex-row gap-2 sm:gap-3 sm:items-center">
          <div className="relative flex-1 sm:w-56">
            <i className="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search clients..."
              className="w-full pl-7 pr-2 py-1.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/60"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 text-xs whitespace-nowrap">Status:</span>
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/60 bg-white min-h-0 h-7"
            >
              <option value="all">All</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => {
              void loadClients();
            }}
            disabled={loading}
            className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold px-3.5 h-7 rounded-lg bg-slate-700 text-white shadow-sm hover:bg-slate-600 active:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-1 whitespace-nowrap"
            aria-label="Refresh client list"
          >
            <i className={`fas fa-sync-alt ${loading ? 'animate-spin' : ''}`} aria-hidden />
            Refresh
          </button>
          <button
            type="button"
            onClick={openAddModal}
            className="bg-brand-navy text-white px-3 py-1.5 text-xs rounded hover:bg-brand-navy-light transition duration-200 whitespace-nowrap"
          >
            <i className="fas fa-plus mr-1.5"></i>Add Client
          </button>
        </div>
      </div>

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
          <p className="text-gray-500 py-4">Loading clients...</p>
        ) : (
          <table className="min-w-full table-auto text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-8 px-2 py-1.5"></th>
                <th
                  className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('full_name')}
                >
                  <span className="inline-flex items-center gap-1">
                    ID / Name
                    {sortBy === 'full_name' && <i className={`fas fa-caret-${sortAsc ? 'up' : 'down'} text-[10px]`} />}
                  </span>
                </th>
                <th
                  className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('dealer_type')}
                >
                  <span className="inline-flex items-center gap-1">
                    Dealer type
                    {sortBy === 'dealer_type' && <i className={`fas fa-caret-${sortAsc ? 'up' : 'down'} text-[10px]`} />}
                  </span>
                </th>
                <th
                  className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('website')}
                >
                  <span className="inline-flex items-center gap-1">
                    Website
                    {sortBy === 'website' && <i className={`fas fa-caret-${sortAsc ? 'up' : 'down'} text-[10px]`} />}
                  </span>
                </th>
                <th
                  className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100 select-none"
                  onClick={() => handleSort('is_active')}
                >
                  <span className="inline-flex items-center gap-1">
                    Active
                    {sortBy === 'is_active' && <i className={`fas fa-caret-${sortAsc ? 'up' : 'down'} text-[10px]`} />}
                  </span>
                </th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedClients.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-2 py-4 text-center text-gray-500">
                    {clients.length === 0
                      ? 'No clients found. Click "Add Client" to create one.'
                      : 'No clients match the current filters. Try "All", different status, or search.'}
                  </td>
                </tr>
              ) : (
                sortedClients.map((client) => (
                  <React.Fragment key={client.id}>
                    <tr
                      className={expandedId === client.id ? 'bg-brand-mint/15' : 'hover:bg-gray-50 cursor-pointer'}
                      onClick={() => toggleExpand(client.id)}
                    >
                      <td className="px-2 py-1.5">
                        <i
                          className={`fas fa-chevron-${expandedId === client.id ? 'down' : 'right'} text-gray-400`}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-gray-900">
                        <span className="font-medium text-gray-500">{client.id}</span>
                        <span className="mx-1.5 text-gray-300">—</span>
                        <span>{client.full_name || '—'}</span>
                      </td>
                      <td className="px-2 py-1.5 text-gray-700">{client.dealer_type || '—'}</td>
                      <td className="px-2 py-1.5 text-gray-700 truncate max-w-[120px]" title={client.website}>
                        {client.website || '—'}
                      </td>
                      <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => toggleClientActive(client, e)}
                          disabled={togglingId === client.id}
                          title={client.is_active ? 'Set inactive' : 'Set active'}
                          className={`px-2 py-0.5 rounded text-xs font-medium ${client.is_active ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'} disabled:opacity-50`}
                        >
                          {togglingId === client.id ? '…' : client.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => openEditModal(client)}
                          className="text-brand-teal hover:text-brand-navy mr-2"
                          title="Edit"
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(client.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </td>
                    </tr>
                    {expandedId === client.id && (
                      <tr>
                        <td colSpan="6" className="px-2 py-2 bg-gray-50 align-top">
                          <div className="text-gray-600 font-medium mb-1">
                            Locations ({(client.client_locations || []).length})
                          </div>
                          {(client.client_locations || []).length === 0 ? (
                            <p className="text-gray-500 text-xs">No locations.</p>
                          ) : (
                            <table className="min-w-full text-xs border border-gray-200 rounded overflow-hidden">
                              <thead className="bg-gray-100">
                                <tr>
                                  <th className="px-2 py-1 text-left">Name</th>
                                  <th className="px-2 py-1 text-left">Address</th>
                                  <th className="px-2 py-1 text-left">City</th>
                                  <th className="px-2 py-1 text-left">State</th>
                                  <th className="px-2 py-1 text-left">Country</th>
                                  <th className="px-2 py-1 text-left">Website</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-100">
                                {client.client_locations.map((loc) => (
                                  <tr key={loc.id}>
                                    <td className="px-2 py-1">{loc.location_name || '—'}</td>
                                    <td className="px-2 py-1">{loc.address || '—'}</td>
                                    <td className="px-2 py-1">{loc.city || '—'}</td>
                                    <td className="px-2 py-1">{loc.state || '—'}</td>
                                    <td className="px-2 py-1">{loc.country || '—'}</td>
                                    <td className="px-2 py-1 truncate max-w-[100px]" title={loc.website}>
                                      {loc.website || '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
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

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingId ? 'Edit Client' : 'Add New Client'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {message.text && (
            <div
              className={`px-3 py-2 rounded ${
                message.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-800'
              }`}
            >
              {message.text}
            </div>
          )}

          <section>
            <h4 className="font-semibold text-gray-800 mb-2 border-b pb-1">Client details</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>Full name *</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => updateClientField('full_name', e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>Dealer type *</label>
                <input
                  type="text"
                  value={formData.dealer_type}
                  onChange={(e) => updateClientField('dealer_type', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Website *</label>
                <input
                  type="text"
                  value={formData.website}
                  onChange={(e) => updateClientField('website', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => updateClientField('address', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Account exec.</label>
                <input
                  type="text"
                  value={formData.account_exe}
                  onChange={(e) => updateClientField('account_exe', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Digital lead</label>
                <input
                  type="text"
                  value={formData.digital_lead}
                  onChange={(e) => updateClientField('digital_lead', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Dealership name</label>
                <input
                  type="text"
                  value={formData.dealership_name}
                  onChange={(e) => updateClientField('dealership_name', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Parent client</label>
                <input
                  type="text"
                  value={formData.parent_client}
                  onChange={(e) => updateClientField('parent_client', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Google Ads ID</label>
                <input
                  type="text"
                  value={formData.google_ads_id}
                  onChange={(e) => updateClientField('google_ads_id', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Google Analytics ID</label>
                <input
                  type="text"
                  value={formData.google_analytics_id}
                  onChange={(e) => updateClientField('google_analytics_id', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>GA4 account email ID</label>
                <input
                  type="text"
                  value={formData.ga4_account_email_id}
                  onChange={(e) => updateClientField('ga4_account_email_id', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Page type logic ID</label>
                <input
                  type="number"
                  value={formData.page_type_logic_id}
                  onChange={(e) => updateClientField('page_type_logic_id', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Inventory API</label>
                <input
                  type="text"
                  value={formData.inventory_api}
                  onChange={(e) => updateClientField('inventory_api', e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => updateClientField('is_active', e.target.checked)}
                    className="rounded"
                  />
                  Active
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={formData.active_pull}
                    onChange={(e) => updateClientField('active_pull', e.target.checked)}
                    className="rounded"
                  />
                  Active pull
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={formData.scrap_feed}
                    onChange={(e) => updateClientField('scrap_feed', e.target.checked)}
                    className="rounded"
                  />
                  Scrap feed
                </label>
              </div>
            </div>
          </section>

          <section>
            <div className="flex justify-between items-center mb-2 border-b pb-1">
              <h4 className="font-semibold text-gray-800">Locations (optional)</h4>
              <button
                type="button"
                onClick={addLocationRow}
                className="text-brand-teal hover:text-brand-navy text-xs"
              >
                <i className="fas fa-plus mr-1"></i>Add location
              </button>
            </div>
            <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
              {locations.map((loc, index) => (
                <div key={index} className="p-2 border border-gray-200 rounded bg-gray-50/50">
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="font-medium text-gray-600">Location {index + 1}</span>
                    {locations.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLocationRow(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="col-span-2">
                      <input
                        type="text"
                        placeholder="Location name"
                        value={loc.location_name}
                        onChange={(e) => updateLocation(index, 'location_name', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="text"
                        placeholder="Address"
                        value={loc.address}
                        onChange={(e) => updateLocation(index, 'address', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Street"
                        value={loc.street}
                        onChange={(e) => updateLocation(index, 'street', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="City"
                        value={loc.city}
                        onChange={(e) => updateLocation(index, 'city', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="State"
                        value={loc.state}
                        onChange={(e) => updateLocation(index, 'state', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Country"
                        value={loc.country}
                        onChange={(e) => updateLocation(index, 'country', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Zip"
                        value={loc.zip}
                        onChange={(e) => updateLocation(index, 'zip', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Website"
                        value={loc.website}
                        onChange={(e) => updateLocation(index, 'website', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Latitude"
                        value={loc.latitude}
                        onChange={(e) => updateLocation(index, 'latitude', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Longitude"
                        value={loc.longitude}
                        onChange={(e) => updateLocation(index, 'longitude', e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="flex justify-end gap-2 pt-3 border-t">
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
              {saving ? 'Saving...' : editingId ? 'Update client' : 'Create client'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Clients;
