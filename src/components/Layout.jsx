import React, { useState, useEffect, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../contexts/AuthContext';
import { loginPageLogoUrl } from '../lib/publicAssets';

const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const m = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    m.addEventListener('change', handler);
    setMatches(m.matches);
    return () => m.removeEventListener('change', handler);
  }, [query]);
  return matches;
};

const Layout = ({ children }) => {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const headerRef = useRef(null);
  const { currentUser, logout, connectionError, clearConnectionError } = useAuth();
  const navigate = useNavigate();

  const avatarInitials = useMemo(() => {
    const name = (currentUser?.name || 'User').trim();
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (name.length >= 2) return name.slice(0, 2).toUpperCase();
    return name[0] ? name[0].toUpperCase() : 'U';
  }, [currentUser?.name]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setUserMenuOpen(false);
        setNotificationsOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isDesktop) setSidebarOpen(false);
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop && sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isDesktop, sidebarOpen]);

  useEffect(() => {
    if (!logoutConfirmOpen) return;
    const onEscape = (e) => {
      if (e.key === 'Escape') setLogoutConfirmOpen(false);
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [logoutConfirmOpen]);

  const handleLogout = (e) => {
    e?.stopPropagation();
    e?.preventDefault();
    flushSync(() => {
      setLogoutConfirmOpen(false);
      setUserMenuOpen(false);
      logout();
    });
    window.setTimeout(() => {
      navigate('/login', { replace: true });
    }, 1000);
  };

  const openLogoutConfirm = () => {
    setUserMenuOpen(false);
    setLogoutConfirmOpen(true);
  };

  const toggleMobileSidebar = () => setSidebarOpen((o) => !o);
  const closeMobileSidebar = () => setSidebarOpen(false);

  const location = useLocation();
  const pageTitles = {
    '/dashboard': 'Dashboard',
    '/profile': 'User Profile',
    '/users': 'User Management',
    '/clients': 'Client Master',
    '/client-inventory-sources': 'Client inventory sources',
    '/roles': 'Role Management',
    '/inventory': 'Inventory Management',
    '/inventory-report': 'Inventory Report',
    '/inventory-comparison': 'Inventory comparison',
    '/sales-report': 'Sales Report',
    '/sale-pending-report': 'Sale pending report',
    '/inventory-daily-count': 'Daily Inventory Count',
    '/scrap-feed-stats': 'Scrap feed statistics',
    '/normalized-scrap-stats': 'Normalized scrap inventory stats',
    '/scraper-control': 'Run Scrapy spider'
  };

  const pageTitle = pageTitles[location.pathname] || 'Dashboard';

  return (
    <div className="layout-app min-h-screen flex flex-col bg-brand-page">
      {/* Full-width top bar: logo left, user right (matches dashboard mock) */}
      <header
        ref={headerRef}
        className="layout-app-header flex h-14 sm:h-[3.75rem] shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-brand-navy px-3 sm:px-5 text-white shadow-sm z-50"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={toggleMobileSidebar}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white/90 hover:bg-white/10 md:hidden"
            aria-label="Open menu"
          >
            <i className="fas fa-bars text-lg" />
          </button>
          <Link
            to="/dashboard"
            className="relative z-[1] flex shrink-0 items-center py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-sm"
            title="Instant Intel RVs"
          >
            <img
              src={loginPageLogoUrl}
              alt="Instant Intel RVs"
              className="block h-9 w-auto max-h-[2.65rem] object-contain object-left sm:h-10 sm:max-h-[2.85rem]"
              width={200}
              height={44}
              decoding="async"
              fetchPriority="high"
            />
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setNotificationsOpen((o) => !o);
                setUserMenuOpen(false);
              }}
              className="relative rounded-md p-2 text-white/90 hover:bg-white/10"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
            >
              <i className="fas fa-bell text-base" />
              <span className="absolute right-1 top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white">
                3
              </span>
            </button>
            {notificationsOpen && (
              <div className="absolute right-0 mt-1 w-72 max-h-[min(70vh,400px)] overflow-y-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg sm:w-80 z-50">
                <div className="sticky top-0 flex items-center justify-between border-b border-gray-100 bg-white px-3 py-2">
                  <span className="text-sm font-semibold text-gray-800">Notifications</span>
                  <button
                    type="button"
                    onClick={() => setNotificationsOpen(false)}
                    className="rounded p-0.5 text-gray-400 hover:text-gray-600"
                    aria-label="Close"
                  >
                    <i className="fas fa-times text-xs" />
                  </button>
                </div>
                <div className="py-1">
                  {[
                    { id: 1, title: 'New client added', time: '2 min ago', unread: true },
                    { id: 2, title: 'Inventory low on Item #4521', time: '1 hour ago', unread: true },
                    { id: 3, title: 'Role permissions updated', time: 'Yesterday', unread: false }
                  ].map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      className="flex w-full gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.unread ? 'bg-brand-mint' : 'bg-transparent'}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-gray-900">{n.title}</span>
                        <span className="mt-0.5 block text-[10px] text-gray-500">{n.time}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="border-t border-gray-100 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setNotificationsOpen(false)}
                    className="text-xs font-medium text-brand-mint hover:text-brand-navy"
                  >
                    View all notifications
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setUserMenuOpen((o) => !o);
                setNotificationsOpen(false);
              }}
              className="flex max-w-[min(100vw-8rem,280px)] items-center gap-2 rounded-md py-1.5 pl-2 pr-2 text-white hover:bg-white/10 sm:gap-2.5"
              id="userMenuToggle"
              aria-expanded={userMenuOpen}
            >
              <i className="fas fa-user hidden text-sm text-white/90 sm:inline" aria-hidden />
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/95 text-xs font-semibold text-brand-navy sm:hidden"
                aria-hidden
              >
                {avatarInitials}
              </span>
              <span className="hidden truncate text-sm text-white/95 sm:inline" title={currentUser?.email || ''}>
                {currentUser?.email || currentUser?.name || 'User'}
              </span>
              <i className="fas fa-chevron-down shrink-0 text-[10px] text-white/70" />
            </button>
            {userMenuOpen && (
              <div
                className="absolute right-0 mt-1 w-44 rounded-md border border-gray-200 bg-white py-0.5 text-xs shadow-lg z-50"
                id="userMenu"
              >
                <Link
                  to="/profile"
                  className="block px-3 py-2 text-gray-700 hover:bg-gray-100"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <i className="fas fa-user mr-2" />
                  Profile
                </Link>
                <Link
                  to="/profile"
                  className="block px-3 py-2 text-gray-700 hover:bg-gray-100"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <i className="fas fa-cog mr-2" />
                  Account
                </Link>
                <hr className="my-0.5" />
                <button
                  type="button"
                  onClick={openLogoutConfirm}
                  className="block w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-100"
                  id="logoutBtn"
                >
                  <i className="fas fa-sign-out-alt mr-2" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Sidebar (mint rail on desktop) + main — below header */}
      <div className="layout-app-body flex min-h-0 flex-1 min-w-0">
        {!isDesktop && sidebarOpen && (
          <div
            className="fixed inset-0 top-14 z-40 bg-black/40 md:hidden"
            onClick={closeMobileSidebar}
            aria-hidden="true"
          />
        )}
        <Sidebar mobileOpen={sidebarOpen} onCloseMobile={closeMobileSidebar} isDesktop={isDesktop} />

        <div className="layout-app-workspace flex min-h-0 min-w-0 flex-1 flex-col">
          {connectionError && (
            <div
              className="flex shrink-0 items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 sm:px-4"
              role="alert"
            >
              <div className="flex min-w-0 items-center gap-2">
                <i className="fas fa-exclamation-triangle shrink-0 text-amber-600" aria-hidden />
                <span className="text-sm text-amber-800">{connectionError}</span>
              </div>
              <button
                type="button"
                onClick={clearConnectionError}
                className="shrink-0 rounded px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                aria-label="Dismiss"
              >
                Dismiss
              </button>
            </div>
          )}
          <main className="min-h-0 flex-1 overflow-auto bg-brand-page p-3 sm:p-4">
            <h1 className="mb-3 text-lg font-bold text-brand-navy sm:text-xl sm:mb-4">{pageTitle}</h1>
            {children}
          </main>
        </div>
      </div>

      {logoutConfirmOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-modal-title"
          onClick={() => setLogoutConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                <i className="fas fa-sign-out-alt text-xl text-slate-500" aria-hidden />
              </div>
              <h3 id="logout-modal-title" className="mb-1 text-lg font-semibold text-slate-800">
                Sign out?
              </h3>
              <p className="mb-6 text-sm text-slate-500">You can sign back in anytime with the same account.</p>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setLogoutConfirmOpen(false)}
                  className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-navy-light"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
