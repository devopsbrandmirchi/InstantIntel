import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { loginPageLogoUrl } from '../lib/publicAssets';
import {
  AUTH_BRAND_NAVY,
  AUTH_PANEL_WHITE,
  authInputWrapClass,
  useAuthPageChrome
} from '../lib/authScreenChrome';

const MIN_NEW_PASSWORD_LEN = 6;

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const { login, requestPasswordReset, completePasswordRecovery, passwordRecoveryPending, currentUser } = useAuth();
  const navigate = useNavigate();
  const [recoveryPwd, setRecoveryPwd] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');

  useAuthPageChrome();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResetMessage('');
    setIsLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecoverySubmit = async (e) => {
    e.preventDefault();
    setRecoveryError('');
    if (recoveryPwd.length < MIN_NEW_PASSWORD_LEN) {
      setRecoveryError(`Password must be at least ${MIN_NEW_PASSWORD_LEN} characters.`);
      return;
    }
    if (recoveryPwd !== recoveryConfirm) {
      setRecoveryError('Passwords do not match.');
      return;
    }
    setRecoveryLoading(true);
    try {
      await completePasswordRecovery(recoveryPwd);
      setRecoveryPwd('');
      setRecoveryConfirm('');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setRecoveryError(err.message || 'Could not update password.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    setResetMessage('');
    if (!email.trim()) {
      setError('Enter your email above, then click Forgot password again.');
      return;
    }
    setResetLoading(true);
    try {
      await requestPasswordReset(email);
      setResetMessage('Check your email for a password reset link.');
    } catch (err) {
      setError(err.message || 'Could not send reset email.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col md:flex-row overflow-hidden overscroll-none"
      style={{ backgroundColor: AUTH_BRAND_NAVY }}
    >
      <section
        className="flex w-full md:w-1/2 max-md:flex-1 max-md:min-h-0 md:h-full md:flex-none flex-col justify-center items-center px-6 py-8 md:px-10 md:py-12 text-white overflow-y-auto"
        style={{ backgroundColor: AUTH_BRAND_NAVY }}
      >
        <h2 className="text-4xl sm:text-5xl md:text-[2.85rem] font-extrabold uppercase tracking-[0.06em] text-white text-center leading-tight">
          Welcome
        </h2>
        <p className="mt-4 text-lg sm:text-xl text-white font-normal text-center">To</p>
        <div className="mt-8 md:mt-12 w-full max-w-[min(100%,320px)] flex justify-center">
          <img
            src={loginPageLogoUrl}
            alt="Instant Intel RVs"
            className="w-full h-auto max-h-[min(28vh,220px)] md:max-h-[260px] object-contain"
            decoding="async"
          />
        </div>
      </section>

      <section
        className="flex w-full md:w-1/2 max-md:flex-1 max-md:min-h-0 md:h-full md:flex-none flex-col justify-center items-center px-6 py-8 md:px-10 md:py-12 overflow-y-auto md:shadow-[-6px_0_20px_-8px_rgba(0,0,0,0.12)]"
        style={{ backgroundColor: AUTH_PANEL_WHITE }}
      >
        <div className="w-full max-w-[360px] mx-auto">
          <div className="flex justify-center mb-5">
            <span
              className="w-[4.5rem] h-[4.5rem] rounded-full bg-gray-600 flex items-center justify-center text-white text-[1.75rem]"
              aria-hidden
            >
              <i className="fas fa-user" />
            </span>
          </div>
          <p className="text-center text-sm text-gray-600">Hello,</p>
          <h1
            className="text-center text-3xl sm:text-[2rem] font-bold uppercase tracking-[0.12em] mt-2 mb-8"
            style={{ color: AUTH_BRAND_NAVY }}
          >
            {passwordRecoveryPending ? 'Set new password' : 'Login'}
          </h1>

          {passwordRecoveryPending ? (
            <form onSubmit={handleRecoverySubmit} className="space-y-4">
              {recoveryError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm" role="alert">
                  {recoveryError}
                </div>
              )}
              <p className="text-sm text-gray-600 text-center">
                Signed in as <span className="font-medium text-gray-800">{currentUser?.email || 'your account'}</span>.
                Choose a new password below.
              </p>
              <div className={authInputWrapClass}>
                <i className="fas fa-lock text-gray-400 text-base w-5 text-center shrink-0" aria-hidden />
                <input
                  type="password"
                  value={recoveryPwd}
                  onChange={(e) => setRecoveryPwd(e.target.value)}
                  autoComplete="new-password"
                  className="flex-1 min-w-0 bg-transparent border-0 p-0 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0 outline-none"
                  placeholder="New password"
                  required
                  minLength={MIN_NEW_PASSWORD_LEN}
                />
              </div>
              <div className={authInputWrapClass}>
                <i className="fas fa-lock text-gray-400 text-base w-5 text-center shrink-0" aria-hidden />
                <input
                  type="password"
                  value={recoveryConfirm}
                  onChange={(e) => setRecoveryConfirm(e.target.value)}
                  autoComplete="new-password"
                  className="flex-1 min-w-0 bg-transparent border-0 p-0 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0 outline-none"
                  placeholder="Confirm new password"
                  required
                  minLength={MIN_NEW_PASSWORD_LEN}
                />
              </div>
              <button
                type="submit"
                disabled={recoveryLoading}
                className="w-full text-white py-3 px-4 rounded-md text-[15px] font-medium transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-sm hover:opacity-95"
                style={{ backgroundColor: AUTH_BRAND_NAVY }}
              >
                {recoveryLoading ? 'Saving…' : 'Update password'}
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm" role="alert">
                {error}
              </div>
            )}
            {resetMessage && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded text-sm" role="status">
                {resetMessage}
              </div>
            )}

            <div className={authInputWrapClass}>
              <i className="fas fa-user text-gray-400 text-base w-5 text-center shrink-0" aria-hidden />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="flex-1 min-w-0 bg-transparent border-0 p-0 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0 outline-none"
                placeholder="Enter your Email"
                required
              />
            </div>

            <div className={authInputWrapClass}>
              <i className="fas fa-lock text-gray-400 text-base w-5 text-center shrink-0" aria-hidden />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="flex-1 min-w-0 bg-transparent border-0 p-0 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0 outline-none"
                placeholder="Your password"
                required
              />
            </div>

            <div className="flex justify-end -mt-1">
              <button
                type="button"
                onClick={() => void handleForgotPassword()}
                disabled={resetLoading}
                className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                {resetLoading ? 'Sending…' : 'Forgot Password'}
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full text-white py-3 px-4 rounded-md text-[15px] font-medium transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-sm hover:opacity-95"
              style={{ backgroundColor: AUTH_BRAND_NAVY }}
            >
              {isLoading ? 'Signing In…' : 'Login'}
            </button>
          </form>
          )}

          {!passwordRecoveryPending && (
          <p className="text-center text-xs text-gray-500 mt-8">
            Don&apos;t have an account?{' '}
            <Link to="/signup" className="text-blue-600 hover:text-blue-800 font-medium">
              Create account
            </Link>
          </p>
          )}
        </div>
      </section>
    </div>
  );
};

export default Login;
