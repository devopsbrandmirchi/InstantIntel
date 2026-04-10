import React, { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const REPORT_PATHS = [
  '/inventory-report',
  '/inventory-comparison',
  '/sales-report',
  '/sale-pending-report',
  '/inventory-daily-count',
  '/daily-sales-count'
];

const REPORT_LINKS = [
  { to: '/inventory-report', label: 'Inventory Report', icon: 'fas fa-file-alt' },
  { to: '/inventory-comparison', label: 'Inventory comparison', icon: 'fas fa-columns' },
  { to: '/sales-report', label: 'Sales Report', icon: 'fas fa-chart-line' },
  { to: '/sale-pending-report', label: 'Sale pending report', icon: 'fas fa-clock' },
  { to: '/inventory-daily-count', label: 'Daily Inventory Count', icon: 'fas fa-list-ol' },
  { to: '/daily-sales-count', label: 'Daily Sales Count', icon: 'fas fa-receipt' }
];

const SCRAP_LINKS = [
  { to: '/scrap-feed-stats', label: 'Scrap feed stats', icon: 'fas fa-table' },
  { to: '/normalized-scrap-stats', label: 'Normalized scrap stats', icon: 'fas fa-layer-group' },
  { to: '/hoot-feed-stats', label: 'Hoot feed stats', icon: 'fas fa-satellite-dish' },
  { to: '/scraper-control', label: 'Run spider', icon: 'fas fa-bug' }
];

const ADMIN_REPORT_PATHS = SCRAP_LINKS.map((l) => l.to);

const linkTop = (active) =>
  `nav-link nav-link-top-level flex items-center px-3 py-2.5 rounded-md border-l-[3px] border-transparent text-brand-navy/90 hover:bg-white/45 hover:text-brand-navy ${
    active ? 'active' : ''
  }`;

const submenuLinkClass = (active) =>
  `nav-submenu-link flex items-center px-4 py-2 pl-10 text-sm text-brand-navy/85 hover:bg-gray-50 hover:text-brand-navy rounded-md md:pl-3 ${
    active ? 'active' : ''
  }`;

const Sidebar = ({ mobileOpen, onCloseMobile, isDesktop }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const isActive = (path) => location.pathname === path;
  const role = (currentUser?.role || 'viewer').toLowerCase();
  const isAdmin = role === 'admin';
  const isViewer = role === 'viewer';

  const [reportsMenuOpen, setReportsMenuOpen] = useState(() =>
    isViewer || REPORT_PATHS.some((p) => location.pathname === p)
  );
  const [scrappingReportsMenuOpen, setScrappingReportsMenuOpen] = useState(() =>
    ADMIN_REPORT_PATHS.some((p) => location.pathname === p)
  );

  useEffect(() => {
    if (isViewer) {
      setReportsMenuOpen(true);
      return;
    }
    if (REPORT_PATHS.some((p) => location.pathname === p)) setReportsMenuOpen(true);
    if (ADMIN_REPORT_PATHS.some((p) => location.pathname === p)) setScrappingReportsMenuOpen(true);
  }, [location.pathname, isViewer]);

  const handleNavClick = () => {
    if (!isDesktop && onCloseMobile) onCloseMobile();
  };

  const handleFooterLogout = () => {
    if (!window.confirm('Sign out?')) return;
    flushSync(() => {
      logout();
    });
    window.setTimeout(() => {
      navigate('/login', { replace: true });
    }, 1000);
  };

  const bottomNavItems = [
    { path: '/users', icon: 'fas fa-user-cog', label: 'User Management', page: 'users' },
    { path: '/roles', icon: 'fas fa-user-tag', label: 'Roles', page: 'roles' },
    { path: '/inventory', icon: 'fas fa-boxes', label: 'Inventory', page: 'inventory' }
  ];

  const reportsSubmenuClass = isDesktop
    ? `nav-submenu nav-submenu-desktop${isViewer ? ' nav-submenu-viewer-open' : ''}`
    : `nav-submenu ${isViewer || reportsMenuOpen ? 'show' : 'hidden'}`;

  const scrapSubmenuClass = isDesktop
    ? 'nav-submenu nav-submenu-desktop'
    : `nav-submenu ${scrappingReportsMenuOpen ? 'show' : 'hidden'}`;

  const asideClass = [
    'sidebar sidebar-themed flex flex-col min-h-0 overflow-y-auto overflow-x-hidden',
    isDesktop ? 'sidebar-layout-embedded sidebar-hover-expand hidden md:flex' : '',
    !isDesktop
      ? `fixed left-0 top-14 z-[45] h-[calc(100vh-3.5rem)] w-[min(280px,88vw)] max-w-[320px] border-r border-brand-navy/15 shadow-lg transition-transform duration-300 ease-out md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`
      : ''
  ]
    .filter(Boolean)
    .join(' ');

  const asideEl = (
    <aside className={asideClass} role="navigation" aria-label="Main navigation">
      <nav
        className="mt-1 flex flex-col overflow-x-hidden overscroll-y-contain px-1 pb-2 md:mt-2 min-h-0"
        aria-label="Sidebar links"
      >
        <ul className="space-y-1 pb-2">
          <li>
            <Link
              to="/dashboard"
              onClick={handleNavClick}
              className={linkTop(isActive('/dashboard'))}
              data-page="dashboard"
              title="Dashboard"
            >
              <i className="fas fa-tachometer-alt mr-3 shrink-0 text-lg md:text-xl" />
              <span className="nav-text">Dashboard</span>
            </Link>
          </li>

          <li className="sidebar-nav-section-label list-none" aria-hidden="true">
            <div className="nav-section-title px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-navy/50">
              Reporting
            </div>
          </li>

          <li>
            <div className="nav-menu-item relative">
              <button
                type="button"
                onClick={() => {
                  if (!isViewer) setReportsMenuOpen(!reportsMenuOpen);
                }}
                className={`nav-link flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-brand-navy/90 hover:bg-white/45 ${
                  REPORT_PATHS.some(isActive) ? 'active bg-white/50' : ''
                }`}
                aria-expanded={
                  isDesktop
                    ? isViewer || REPORT_PATHS.some(isActive)
                    : isViewer
                      ? true
                      : reportsMenuOpen
                }
                aria-haspopup="true"
                id="reportsMenuToggle"
              >
                <div className="flex min-w-0 items-center">
                  <i className="fas fa-chart-bar mr-3 shrink-0 text-lg md:text-xl" />
                  <span className="nav-text">Reports</span>
                </div>
                <i
                  className={`fas fa-chevron-down nav-chevron shrink-0 text-xs ${reportsMenuOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                />
              </button>
              <ul className={reportsSubmenuClass} id="reportsSubmenu">
                {REPORT_LINKS.map(({ to, label, icon }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      onClick={handleNavClick}
                      className={submenuLinkClass(isActive(to))}
                      data-page={to.replace('/', '')}
                    >
                      <i className={`${icon} mr-3 shrink-0 text-sm`} />
                      <span className="nav-text">{label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </li>

          <li>
            <Link
              to="/profile"
              onClick={handleNavClick}
              className={linkTop(isActive('/profile'))}
              data-page="profile"
              title="User Profile"
            >
              <i className="fas fa-user mr-3 shrink-0 text-lg md:text-xl" />
              <span className="nav-text">User Profile</span>
            </Link>
          </li>

          {isAdmin && (
            <li>
              <div className="nav-menu-item relative">
                <button
                  type="button"
                  onClick={() => setScrappingReportsMenuOpen(!scrappingReportsMenuOpen)}
                  className={`nav-link flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-brand-navy/90 hover:bg-white/45 ${
                    ADMIN_REPORT_PATHS.some(isActive) ? 'active bg-white/50' : ''
                  }`}
                  aria-expanded={
                    isDesktop ? ADMIN_REPORT_PATHS.some(isActive) : scrappingReportsMenuOpen
                  }
                  aria-haspopup="true"
                  id="scrappingReportsMenuToggle"
                >
                  <div className="flex min-w-0 items-center">
                    <i className="fas fa-spider mr-3 shrink-0 text-lg md:text-xl" aria-hidden />
                    <span className="nav-text">Scrapping Reports</span>
                  </div>
                  <i
                    className={`fas fa-chevron-down nav-chevron shrink-0 text-xs ${scrappingReportsMenuOpen ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>
                <ul className={scrapSubmenuClass} id="scrappingReportsSubmenu">
                  {SCRAP_LINKS.map(({ to, label, icon }) => (
                    <li key={to}>
                      <Link
                        to={to}
                        onClick={handleNavClick}
                        className={submenuLinkClass(isActive(to))}
                        data-page={to.replace(/\//g, '')}
                      >
                        <i className={`${icon} mr-3 shrink-0 text-sm`} aria-hidden />
                        <span className="nav-text">{label}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          )}

          {isAdmin && (
            <li className="sidebar-nav-section-break sidebar-nav-section-label list-none" aria-hidden="true">
              <div className="nav-section-divider mx-2 my-2 border-t border-brand-navy/15" />
              <div className="nav-section-title px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-navy/50">
                Management
              </div>
            </li>
          )}

          {isAdmin && (
            <li>
              <Link
                to="/clients"
                onClick={handleNavClick}
                className={linkTop(isActive('/clients'))}
                data-page="clients"
                title="Client Master"
              >
                <i className="fas fa-users mr-3 shrink-0 text-lg md:text-xl" />
                <span className="nav-text font-medium">Client Master</span>
              </Link>
            </li>
          )}
          {isAdmin && (
            <li>
              <Link
                to="/client-inventory-sources"
                onClick={handleNavClick}
                className={linkTop(isActive('/client-inventory-sources'))}
                data-page="client-inventory-sources"
                title="Inventory sources"
              >
                <i className="fas fa-database mr-3 shrink-0 text-lg md:text-xl" />
                <span className="nav-text">Inventory sources</span>
              </Link>
            </li>
          )}
          {isAdmin && (
            <li>
              <Link
                to="/sendgrid-event-stats"
                onClick={handleNavClick}
                className={linkTop(isActive('/sendgrid-event-stats'))}
                data-page="sendgrid-event-stats"
                title="SendGrid event stats"
              >
                <i className="fas fa-envelope-open-text mr-3 shrink-0 text-lg md:text-xl" />
                <span className="nav-text">SendGrid event stats</span>
              </Link>
            </li>
          )}
          {isAdmin && (
            <li>
              <Link
                to="/sendgrid-autoname-event-stats"
                onClick={handleNavClick}
                className={linkTop(isActive('/sendgrid-autoname-event-stats'))}
                data-page="sendgrid-autoname-event-stats"
                title="SendGrid autoname stats"
              >
                <i className="fas fa-envelope mr-3 shrink-0 text-lg md:text-xl" />
                <span className="nav-text">SendGrid autoname stats</span>
              </Link>
            </li>
          )}

          {isAdmin &&
            bottomNavItems.map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  onClick={handleNavClick}
                  className={linkTop(isActive(item.path))}
                  data-page={item.page}
                  title={item.label}
                >
                  <i className={`${item.icon} mr-3 shrink-0 text-lg md:text-xl`} />
                  <span className="nav-text">{item.label}</span>
                </Link>
              </li>
            ))}
          {isAdmin && (
            <li>
              <Link
                to="/login-history"
                onClick={handleNavClick}
                className={linkTop(isActive('/login-history'))}
                data-page="login-history"
                title="Login History"
              >
                <i className="fas fa-history mr-3 shrink-0 text-lg md:text-xl" />
                <span className="nav-text">Login History</span>
              </Link>
            </li>
          )}
        </ul>
      </nav>

      <div className="flex shrink-0 flex-col gap-0.5 border-t border-brand-navy/15 px-1 py-2">
        <button
          type="button"
          onClick={handleFooterLogout}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2.5 text-left text-brand-navy/90 hover:bg-white/45 md:justify-start"
          title="Logout"
        >
          <i className="fas fa-sign-out-alt w-5 shrink-0 text-center text-lg text-brand-navy/80" aria-hidden />
          <span className="nav-text text-sm">Logout</span>
        </button>
      </div>

      {!isDesktop && (
        <div className="flex shrink-0 justify-end border-t border-brand-navy/15 p-2 md:hidden">
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-md p-2 text-brand-navy/70 hover:bg-white/40 hover:text-brand-navy"
            aria-label="Close menu"
          >
            <i className="fas fa-times text-lg" />
          </button>
        </div>
      )}
    </aside>
  );

  /* Desktop: fixed-width column in flex layout; aside is absolutely positioned so hover width overlays main */
  if (!isDesktop) return asideEl;

  return (
    <div className="relative hidden min-h-0 w-[76px] shrink-0 self-stretch overflow-visible md:block">
      {asideEl}
    </div>
  );
};

export default Sidebar;
