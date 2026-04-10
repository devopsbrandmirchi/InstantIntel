import React, { useState, useEffect } from 'react';
import Modal from '../components/Modal';

const Inventory = () => {
  const [items, setItems] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    quantity: 0,
    price: 0,
    description: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    try {
      const res = await fetch('tables/inventory');
      const data = await res.json();
      setItems(data.data || []);
    } catch (err) {
      console.error('Error loading inventory:', err);
      setItems([]);
    }
  };

  const openAddModal = () => {
    setEditingId(null);
    setFormData({ name: '', sku: '', quantity: 0, price: 0, description: '' });
    setModalOpen(true);
  };

  const openEditModal = async (itemId) => {
    try {
      const res = await fetch(`tables/inventory/${itemId}`);
      const item = await res.json();
      setFormData({
        name: item.name || '',
        sku: item.sku || '',
        quantity: item.quantity ?? 0,
        price: item.price ?? 0,
        description: item.description || ''
      });
      setEditingId(itemId);
      setModalOpen(true);
    } catch (err) {
      console.error('Error loading item:', err);
      alert('Error loading item data.');
    }
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: formData.name,
        sku: formData.sku,
        quantity: parseInt(formData.quantity, 10) || 0,
        price: parseFloat(formData.price) || 0,
        description: formData.description
      };
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `tables/inventory/${editingId}` : 'tables/inventory';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        closeModal();
        loadInventory();
        alert(editingId ? 'Item updated successfully!' : 'Item created successfully!');
      } else {
        alert('Error saving item. Please try again.');
      }
    } catch (err) {
      console.error('Error saving inventory:', err);
      alert('Error saving item. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (itemId) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      const res = await fetch(`tables/inventory/${itemId}`, { method: 'DELETE' });
      if (res.ok) {
        loadInventory();
        alert('Item deleted successfully!');
      } else {
        alert('Error deleting item. Please try again.');
      }
    } catch (err) {
      console.error('Error deleting item:', err);
      alert('Error deleting item. Please try again.');
    }
  };

  const inputClass = 'w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/60 min-h-0 h-7';

  return (
    <div className="bg-white rounded shadow-md p-4 text-xs">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-base font-bold text-gray-800">Inventory Management</h2>
        <button
          type="button"
          onClick={openAddModal}
          className="bg-brand-navy text-white px-3 py-1.5 text-xs rounded hover:bg-brand-navy-light transition duration-200"
        >
          <i className="fas fa-plus mr-1.5"></i>Add Item
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full table-auto text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase">Item Name</th>
              <th className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase">SKU</th>
              <th className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase">Quantity</th>
              <th className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase">Price</th>
              <th className="px-2 py-1.5 text-left font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {items.length === 0 ? (
              <tr>
                <td colSpan="5" className="px-2 py-2 text-center text-gray-500">
                  No inventory items found. Click "Add Item" to create one.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td className="px-2 py-1.5 text-gray-900">{item.name || ''}</td>
                  <td className="px-2 py-1.5 text-gray-700">{item.sku || ''}</td>
                  <td className="px-2 py-1.5 text-gray-700">{item.quantity ?? 0}</td>
                  <td className="px-2 py-1.5 text-gray-700">${(item.price ?? 0).toFixed(2)}</td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(item.id)}
                      className="text-brand-teal hover:text-brand-navy mr-2"
                      title="Edit"
                    >
                      <i className="fas fa-edit"></i>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
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

      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title={editingId ? 'Edit Item' : 'Add New Item'}
      >
        <form onSubmit={handleSubmit} className="space-y-2 text-xs">
          <div>
            <label className="block font-medium text-gray-700 mb-1">Item Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={inputClass}
              required
            />
          </div>
          <div>
            <label className="block font-medium text-gray-700 mb-1">SKU *</label>
            <input
              type="text"
              value={formData.sku}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              className={inputClass}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-medium text-gray-700 mb-1">Quantity *</label>
              <input
                type="number"
                min={0}
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block font-medium text-gray-700 mb-1">Price *</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className={inputClass}
                required
              />
            </div>
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

export default Inventory;
