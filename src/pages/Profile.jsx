import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const MIN_PASSWORD_LEN = 6;

const Profile = () => {
  const { currentUser, updateProfile, changePassword, supabase } = useAuth();
  const isAdmin = (currentUser?.role || '').toLowerCase() === 'admin';
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: ''
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [canChangePassword, setCanChangePassword] = useState(null);
  const [pwdForm, setPwdForm] = useState({
    current: '',
    next: '',
    confirm: ''
  });
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMessage, setPwdMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    if (currentUser) {
      const nameParts = (currentUser.name || '').trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      setFormData({
        firstName,
        lastName,
        email: currentUser.email || '',
        phone: currentUser.phone || ''
      });
    }
  }, [currentUser]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) return;
      const hasEmailPassword = user.identities?.some((i) => i.provider === 'email');
      setCanChangePassword(!!hasEmailPassword);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, supabase]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    setSaving(true);
    try {
      const fullName = [formData.firstName, formData.lastName].filter(Boolean).join(' ');
      const payload = {
        full_name: fullName,
        phone: formData.phone
      };
      if (isAdmin) {
        payload.email = formData.email;
      }
      await updateProfile(payload);
      setMessage({ type: 'success', text: 'Profile updated successfully.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to update profile.' });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPwdMessage({ type: '', text: '' });
    if (pwdForm.next.length < MIN_PASSWORD_LEN) {
      setPwdMessage({ type: 'error', text: `New password must be at least ${MIN_PASSWORD_LEN} characters.` });
      return;
    }
    if (pwdForm.next !== pwdForm.confirm) {
      setPwdMessage({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }
    setPwdSaving(true);
    try {
      await changePassword(pwdForm.current, pwdForm.next);
      setPwdForm({ current: '', next: '', confirm: '' });
      setPwdMessage({ type: 'success', text: 'Password updated successfully.' });
    } catch (err) {
      setPwdMessage({ type: 'error', text: err.message || 'Failed to update password.' });
    } finally {
      setPwdSaving(false);
    }
  };

  return (
    <div className="bg-white rounded shadow-md p-4 text-xs">
      <h2 className="text-base font-bold text-gray-800 mb-3">User Profile</h2>
      {message.text && (
        <div
          className={`mb-3 px-3 py-2 rounded text-sm ${
            message.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-800'
          }`}
        >
          {message.text}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">First Name</label>
            <input
              type="text"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/60 min-h-0 h-7"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Last Name</label>
            <input
              type="text"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/60 min-h-0 h-7"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={formData.email}
            {...(isAdmin
              ? {
                  onChange: (e) => setFormData({ ...formData, email: e.target.value })
                }
              : { readOnly: true })}
            className={`w-full px-2 py-1 text-xs border rounded min-h-0 h-7 ${
              isAdmin
                ? 'border-gray-300 focus:outline-none focus:ring-1 focus:ring-brand-teal/60 bg-white'
                : 'border-gray-200 bg-gray-50'
            }`}
          />
          <p className="text-gray-500 mt-0.5">
            {isAdmin
              ? 'Changing email may require confirming the new address (check Supabase / email settings).'
              : 'Only an administrator can change the account email.'}
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/60 min-h-0 h-7"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="bg-brand-navy text-white px-4 py-1.5 text-xs rounded hover:bg-brand-navy-light transition duration-200 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Update Profile'}
        </button>
      </form>

      <hr className="my-6 border-gray-200" />
      <h3 className="text-sm font-bold text-gray-800 mb-2">Change password</h3>
      {canChangePassword === null && <p className="text-gray-500 text-xs">Checking account…</p>}
      {canChangePassword === false && (
        <p className="text-gray-600 text-xs mb-2">
          Your account uses a social or other sign-in method without an email password. Password cannot be changed here.
        </p>
      )}
      {canChangePassword === true && (
        <>
          {pwdMessage.text && (
            <div
              className={`mb-3 px-3 py-2 rounded text-sm ${
                pwdMessage.type === 'error'
                  ? 'bg-red-50 border border-red-200 text-red-700'
                  : 'bg-green-50 border border-green-200 text-green-800'
              }`}
            >
              {pwdMessage.text}
            </div>
          )}
          <form onSubmit={handlePasswordSubmit} className="space-y-2 max-w-md">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Current password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={pwdForm.current}
                onChange={(e) => setPwdForm({ ...pwdForm, current: e.target.value })}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/60 min-h-0 h-7"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">New password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={pwdForm.next}
                onChange={(e) => setPwdForm({ ...pwdForm, next: e.target.value })}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/60 min-h-0 h-7"
                minLength={MIN_PASSWORD_LEN}
                required
              />
              <p className="text-gray-500 mt-0.5">At least {MIN_PASSWORD_LEN} characters.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Confirm new password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={pwdForm.confirm}
                onChange={(e) => setPwdForm({ ...pwdForm, confirm: e.target.value })}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-brand-teal/60 min-h-0 h-7"
                minLength={MIN_PASSWORD_LEN}
                required
              />
            </div>
            <button
              type="submit"
              disabled={pwdSaving}
              className="bg-slate-700 text-white px-4 py-1.5 text-xs rounded hover:bg-slate-800 transition duration-200 disabled:opacity-50"
            >
              {pwdSaving ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </>
      )}
    </div>
  );
};

export default Profile;

