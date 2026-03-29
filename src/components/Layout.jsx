import React, { useState, useEffect, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../contexts/AuthContext';

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  const toggleSidebar = () => {
    if (isDesktop) {
      setSidebarCollapsed((c) => !c);
    } else {
      setSidebarOpen((o) => !o);
    }
  };

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
    '/inventory-daily-count': 'Daily Inventory Count',
    '/scrap-feed-stats': 'Scrap feed statistics',
    '/normalized-scrap-stats': 'Normalized scrap inventory stats',
    '/scraper-control': 'Run Scrapy spider'
  };

  const pageTitle = pageTitles[location.pathname] || 'Dashboard';

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Mobile overlay when sidebar is open */}
      {!isDesktop && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={closeMobileSidebar}
          aria-hidden="true"
        />
      )}
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        mobileOpen={sidebarOpen}
        onCloseMobile={closeMobileSidebar}
        isDesktop={isDesktop}
      />
      <div className={`main-content flex-1 flex flex-col min-w-0 ${sidebarCollapsed && isDesktop ? 'expanded' : ''}`}>
        <header ref={headerRef} className="bg-white shadow-md px-3 py-2 sm:px-4 flex-shrink-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center min-w-0 flex-1">
              <button
                onClick={toggleSidebar}
                className="text-gray-600 hover:text-gray-800 mr-2 flex-shrink-0"
                id="sidebarCollapse"
                aria-label="Toggle menu"
              >
                <i className="fas fa-bars text-base sm:text-lg"></i>
              </button>
              <h1 className="text-base sm:text-lg font-bold text-gray-800 truncate">{pageTitle}</h1>
            </div>
            <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setNotificationsOpen((o) => !o);
                    setUserMenuOpen(false);
                  }}
                  className="text-gray-600 hover:text-gray-800 relative p-1.5 rounded hover:bg-gray-100"
                  aria-label="Notifications"
                  aria-expanded={notificationsOpen}
                >
                  <i className="fas fa-bell text-sm sm:text-base"></i>
                  <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
                    3
                  </span>
                </button>
                {notificationsOpen && (
                  <div className="absolute right-0 mt-1 w-72 sm:w-80 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50 max-h-[min(70vh,400px)] overflow-y-auto">
                    <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
                      <span className="font-semibold text-gray-800 text-sm">Notifications</span>
                      <button
                        type="button"
                        onClick={() => setNotificationsOpen(false)}
                        className="text-gray-400 hover:text-gray-600 p-0.5"
                        aria-label="Close"
                      >
                        <i className="fas fa-times text-xs"></i>
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
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs text-gray-700 flex gap-2"
                        >
                          <span className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${n.unread ? 'bg-blue-500' : 'bg-transparent'}`} />
                          <span className="flex-1 min-w-0">
                            <span className="block font-medium text-gray-900 truncate">{n.title}</span>
                            <span className="block text-gray-500 text-[10px] mt-0.5">{n.time}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="border-t border-gray-100 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setNotificationsOpen(false)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
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
                  className="flex items-center space-x-1.5 text-gray-700 hover:text-gray-900 text-xs sm:text-sm min-w-0 rounded hover:bg-gray-100 py-1 pr-1"
                  id="userMenuToggle"
                  aria-expanded={userMenuOpen}
                >
                  <span
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-semibold bg-indigo-600"
                    aria-hidden="true"
                  >
                    {avatarInitials}
                  </span>
                  <span id="userName" className="hidden sm:inline truncate max-w-[120px]">{currentUser?.name || 'User'}</span>
                  <i className="fas fa-chevron-down text-xs flex-shrink-0"></i>
                </button>
                {userMenuOpen && (
                  <div
                    className="absolute right-0 mt-1 w-40 bg-white rounded-md shadow-lg border border-gray-200 py-0.5 z-50 text-xs"
                    id="userMenu"
                  >
                    <Link
                      to="/profile"
                      className="block px-3 py-1.5 text-gray-700 hover:bg-gray-100"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <i className="fas fa-user mr-2"></i>Profile
                    </Link>
                    <Link
                      to="/settings"
                      className="block px-3 py-1.5 text-gray-700 hover:bg-gray-100"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <i className="fas fa-cog mr-2"></i>Settings
                    </Link>
                    <hr className="my-0.5" />
                    <button
                      onClick={openLogoutConfirm}
                      className="block w-full text-left px-3 py-1.5 text-gray-700 hover:bg-gray-100"
                      id="logoutBtn"
                    >
                      <i className="fas fa-sign-out-alt mr-2"></i>Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        {connectionError && (
          <div className="flex-shrink-0 px-3 py-2 sm:px-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between gap-2" role="alert">
            <div className="flex items-center gap-2 min-w-0">
              <i className="fas fa-exclamation-triangle text-amber-600 flex-shrink-0" aria-hidden="true" />
              <span className="text-sm text-amber-800">{connectionError}</span>
            </div>
            <button
              type="button"
              onClick={clearConnectionError}
              className="flex-shrink-0 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 rounded"
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </div>
        )}
        <main className="flex-1 p-3 sm:p-4 overflow-auto min-h-0">{children}</main>
      </div>

      {/* Logout confirmation modal */}
      {logoutConfirmOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-modal-title"
          onClick={() => setLogoutConfirmOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full overflow-hidden border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                <i className="fas fa-sign-out-alt text-xl text-slate-500" aria-hidden="true" />
              </div>
              <h3 id="logout-modal-title" className="text-lg font-semibold text-slate-800 mb-1">
                Sign out?
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                You can sign back in anytime with the same account.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => setLogoutConfirmOpen(false)}
                  className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-slate-700 hover:bg-slate-800 rounded-xl transition-colors"
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

