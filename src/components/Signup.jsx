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

const Signup = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { signUp } = useAuth();
  const navigate = useNavigate();

  useAuthPageChrome();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setIsLoading(true);

    try {
      const result = await signUp(email, password, { full_name: fullName });
      setSuccess(result.message || 'Account created successfully.');
      if (result.user && result.message?.includes('signed in')) {
        navigate('/dashboard');
      } else {
        navigate('/login');
      }
    } catch (err) {
      setError(err.message || 'Sign up failed. Please try again.');
    } finally {
      setIsLoading(false);
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
              <i className="fas fa-user-plus" />
            </span>
          </div>
          <p className="text-center text-sm text-gray-600">Hello,</p>
          <h1
            className="text-center text-2xl sm:text-[1.65rem] font-bold uppercase tracking-[0.1em] mt-2 mb-6 leading-snug"
            style={{ color: AUTH_BRAND_NAVY }}
          >
            Create account
          </h1>

          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm" role="alert">
                {error}
              </div>
            )}
            {success && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded text-sm" role="status">
                {success}
              </div>
            )}

            <div className={authInputWrapClass}>
              <i className="fas fa-id-card text-gray-400 text-base w-5 text-center shrink-0" aria-hidden />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                className="flex-1 min-w-0 bg-transparent border-0 p-0 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0 outline-none"
                placeholder="Your name"
              />
            </div>

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
                autoComplete="new-password"
                className="flex-1 min-w-0 bg-transparent border-0 p-0 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0 outline-none"
                placeholder="At least 6 characters"
                required
                minLength={6}
              />
            </div>

            <div className={authInputWrapClass}>
              <i className="fas fa-lock text-gray-400 text-base w-5 text-center shrink-0" aria-hidden />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className="flex-1 min-w-0 bg-transparent border-0 p-0 text-sm text-gray-900 placeholder:text-gray-400 focus:ring-0 outline-none"
                placeholder="Confirm password"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full text-white py-3 px-4 rounded-md text-[15px] font-medium transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-3 shadow-sm hover:opacity-95"
              style={{ backgroundColor: AUTH_BRAND_NAVY }}
            >
              {isLoading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-xs text-gray-500 mt-8">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-600 hover:text-blue-800 font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
};

export default Signup;
