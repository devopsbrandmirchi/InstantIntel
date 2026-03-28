import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const REPORT_PATHS = ['/inventory-report', '/sales-report', '/inventory-daily-count', '/daily-sales-count'];
const ADMIN_REPORT_PATHS = [
  '/scrap-feed-stats',
  '/normalized-scrap-stats',
  '/hoot-feed-stats',
  '/scraper-control'
];

const Sidebar = ({ collapsed, onToggle, mobileOpen, onCloseMobile, isDesktop }) => {
  const location = useLocation();
  const { currentUser } = useAuth();
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

  const bottomNavItems = [
    { path: '/profile', icon: 'fas fa-user', label: 'User Profile', page: 'profile' },
    { path: '/users', icon: 'fas fa-user-cog', label: 'User Management', page: 'users' },
    { path: '/roles', icon: 'fas fa-user-tag', label: 'Roles', page: 'roles' },
    { path: '/inventory', icon: 'fas fa-boxes', label: 'Inventory', page: 'inventory' }
  ];

  const submenuLinkClass = (path) =>
    `nav-submenu-link flex items-center px-4 py-2 pl-12 text-white/75 hover:bg-white/10 hover:text-white rounded-md ${
      isActive(path) ? 'active' : ''
    }`;

  return (
    <div
      className={`sidebar sidebar-themed w-64 flex-shrink-0 flex flex-col min-h-0 transition-all duration-300 ${collapsed && isDesktop ? 'collapsed' : ''} ${!isDesktop && mobileOpen ? 'sidebar-mobile-open' : ''}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="p-4 border-b border-white/10 sidebar-header flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">
            <i className="fas fa-building mr-2 text-amber-400/90"></i>
            {(!collapsed || !isDesktop) && <span className="text-white">Instant Intel</span>}
          </h2>
          <div className="flex items-center gap-1">
            {!isDesktop && (
              <button
                onClick={onCloseMobile}
                className="text-white/70 hover:text-white p-2 -m-2 md:hidden"
                aria-label="Close menu"
              >
                <i className="fas fa-times"></i>
              </button>
            )}
            {isDesktop && (
              <button onClick={onToggle} className="text-white/70 hover:text-white p-2 -m-2" aria-label="Collapse menu">
                <i className="fas fa-bars"></i>
              </button>
            )}
          </div>
        </div>
      </div>
      <nav className="mt-4 flex-1 min-h-0 overflow-y-auto overscroll-y-contain pb-6" aria-label="Sidebar links">
        <ul className="space-y-2 pb-2">
          {/* 1. Dashboard */}
          <li>
            <Link
              to="/dashboard"
              onClick={handleNavClick}
              className={`nav-link nav-link-top-level flex items-center px-4 py-2 text-white/90 hover:bg-white/10 hover:text-white rounded-md border-l-[3px] border-transparent ${
                isActive('/dashboard') ? 'active' : ''
              }`}
              data-page="dashboard"
            >
              <i className="fas fa-tachometer-alt mr-3"></i>
              <span className="nav-text">Dashboard</span>
            </Link>
          </li>

          <li className="list-none sidebar-nav-section-label" aria-hidden="true">
            <div className="nav-section-title px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
              Reporting
            </div>
          </li>

          {/* 2. Reports */}
          <li>
            <div className="nav-menu-item">
              <button
                type="button"
                onClick={() => {
                  if (!isViewer) setReportsMenuOpen(!reportsMenuOpen);
                }}
                className="nav-link flex items-center justify-between w-full px-4 py-2 text-white/85 hover:bg-white/10 hover:text-white rounded-md"
                id="reportsMenuToggle"
                aria-expanded={isViewer ? true : reportsMenuOpen}
              >
                <div className="flex items-center">
                  <i className="fas fa-chart-bar mr-3"></i>
                  <span className="nav-text">Reports</span>
                </div>
                {!isViewer && <i className={`fas fa-chevron-down text-xs nav-chevron ${reportsMenuOpen ? 'rotate-180' : ''}`}></i>}
              </button>
              <ul className={`nav-submenu ${isViewer || reportsMenuOpen ? 'show' : 'hidden'}`} id="reportsSubmenu">
                <li>
                  <Link
                    to="/inventory-report"
                    onClick={handleNavClick}
                    className={submenuLinkClass('/inventory-report')}
                    data-page="inventory-report"
                  >
                    <i className="fas fa-file-alt mr-3 text-sm"></i>
                    <span className="nav-text">Inventory Report</span>
                  </Link>
                </li>
                <li>
                  <Link
                    to="/sales-report"
                    onClick={handleNavClick}
                    className={submenuLinkClass('/sales-report')}
                    data-page="sales-report"
                  >
                    <i className="fas fa-chart-line mr-3 text-sm"></i>
                    <span className="nav-text">Sales Report</span>
                  </Link>
                </li>
                <li>
                  <Link
                    to="/inventory-daily-count"
                    onClick={handleNavClick}
                    className={submenuLinkClass('/inventory-daily-count')}
                    data-page="inventory-daily-count"
                  >
                    <i className="fas fa-list-ol mr-3 text-sm"></i>
                    <span className="nav-text">Daily Inventory Count</span>
                  </Link>
                </li>
                <li>
                  <Link
                    to="/daily-sales-count"
                    onClick={handleNavClick}
                    className={submenuLinkClass('/daily-sales-count')}
                    data-page="daily-sales-count"
                  >
                    <i className="fas fa-receipt mr-3 text-sm"></i>
                    <span className="nav-text">Daily Sales Count</span>
                  </Link>
                </li>
              </ul>
            </div>
          </li>

          {/* 3. Scrapping Reports */}
          {isAdmin && <li>
            <div className="nav-menu-item">
              <button
                type="button"
                onClick={() => setScrappingReportsMenuOpen(!scrappingReportsMenuOpen)}
                className="nav-link flex items-center justify-between w-full px-4 py-2 text-white/85 hover:bg-white/10 hover:text-white rounded-md"
                id="scrappingReportsMenuToggle"
                aria-expanded={scrappingReportsMenuOpen}
              >
                <div className="flex items-center">
                  <i className="fas fa-spider mr-3" aria-hidden="true"></i>
                  <span className="nav-text">Scrapping Reports</span>
                </div>
                <i className={`fas fa-chevron-down text-xs nav-chevron ${scrappingReportsMenuOpen ? 'rotate-180' : ''}`}></i>
              </button>
              <ul className={`nav-submenu ${scrappingReportsMenuOpen ? 'show' : 'hidden'}`} id="scrappingReportsSubmenu">
                <li>
                  <Link
                    to="/scrap-feed-stats"
                    onClick={handleNavClick}
                    className={submenuLinkClass('/scrap-feed-stats')}
                    data-page="scrap-feed-stats"
                  >
                    <i className="fas fa-table mr-3 text-sm"></i>
                    <span className="nav-text">Scrap feed stats</span>
                  </Link>
                </li>
                <li>
                  <Link
                    to="/normalized-scrap-stats"
                    onClick={handleNavClick}
                    className={submenuLinkClass('/normalized-scrap-stats')}
                    data-page="normalized-scrap-stats"
                  >
                    <i className="fas fa-layer-group mr-3 text-sm"></i>
                    <span className="nav-text">Normalized scrap stats</span>
                  </Link>
                </li>
                <li>
                  <Link
                    to="/hoot-feed-stats"
                    onClick={handleNavClick}
                    className={submenuLinkClass('/hoot-feed-stats')}
                    data-page="hoot-feed-stats"
                  >
                    <i className="fas fa-satellite-dish mr-3 text-sm"></i>
                    <span className="nav-text">Hoot feed stats</span>
                  </Link>
                </li>
                <li>
                  <Link
                    to="/scraper-control"
                    onClick={handleNavClick}
                    className={submenuLinkClass('/scraper-control')}
                    data-page="scraper-control"
                  >
                    <i className="fas fa-bug mr-3 text-sm" aria-hidden />
                    <span className="nav-text">Run spider</span>
                  </Link>
                </li>
              </ul>
            </div>
          </li>}

          {/* Section break: after Scrapping Reports */}
          {isAdmin && <li className="sidebar-nav-section-break sidebar-nav-section-label list-none" aria-hidden="true">
            <div className="nav-section-divider mx-3 my-2 border-t border-white/25" />
            <div className="nav-section-title px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">
              Management
            </div>
          </li>}

          {/* Client Master & below */}
          {isAdmin && <li>
            <Link
              to="/clients"
              onClick={handleNavClick}
              className={`nav-link nav-link-top-level flex items-center px-4 py-2 text-white/90 hover:bg-white/10 hover:text-white rounded-md border-l-[3px] border-transparent ${
                isActive('/clients') ? 'active' : ''
              }`}
              data-page="clients"
            >
              <i className="fas fa-users mr-3 text-sky-300/90"></i>
              <span className="nav-text font-medium">Client Master</span>
            </Link>
          </li>}
          {isAdmin && <li>
            <Link
              to="/client-inventory-sources"
              onClick={handleNavClick}
              className={`nav-link nav-link-top-level flex items-center px-4 py-2 text-white/90 hover:bg-white/10 hover:text-white rounded-md border-l-[3px] border-transparent ${
                isActive('/client-inventory-sources') ? 'active' : ''
              }`}
              data-page="client-inventory-sources"
            >
              <i className="fas fa-database mr-3 text-emerald-300/90"></i>
              <span className="nav-text">Inventory sources</span>
            </Link>
          </li>}
          {isAdmin && <li>
            <Link
              to="/sendgrid-event-stats"
              onClick={handleNavClick}
              className={`nav-link nav-link-top-level flex items-center px-4 py-2 text-white/90 hover:bg-white/10 hover:text-white rounded-md border-l-[3px] border-transparent ${
                isActive('/sendgrid-event-stats') ? 'active' : ''
              }`}
              data-page="sendgrid-event-stats"
            >
              <i className="fas fa-envelope-open-text mr-3 text-violet-300/90"></i>
              <span className="nav-text">SendGrid event stats</span>
            </Link>
          </li>}
          {isAdmin && <li>
            <Link
              to="/sendgrid-autoname-event-stats"
              onClick={handleNavClick}
              className={`nav-link nav-link-top-level flex items-center px-4 py-2 text-white/90 hover:bg-white/10 hover:text-white rounded-md border-l-[3px] border-transparent ${
                isActive('/sendgrid-autoname-event-stats') ? 'active' : ''
              }`}
              data-page="sendgrid-autoname-event-stats"
            >
              <i className="fas fa-envelope mr-3 text-fuchsia-300/90"></i>
              <span className="nav-text">SendGrid autoname stats</span>
            </Link>
          </li>}

          {/* User Profile, User Management, Roles, Inventory */}
          {isAdmin && bottomNavItems.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                onClick={handleNavClick}
                className={`nav-link nav-link-top-level flex items-center px-4 py-2 text-white/90 hover:bg-white/10 hover:text-white rounded-md border-l-[3px] border-transparent ${
                  isActive(item.path) ? 'active' : ''
                }`}
                data-page={item.page}
              >
                <i className={`${item.icon} mr-3`}></i>
                <span className="nav-text">{item.label}</span>
              </Link>
            </li>
          ))}
          {isAdmin && <li>
            <Link
              to="/login-history"
              onClick={handleNavClick}
              className={`nav-link nav-link-top-level flex items-center px-4 py-2 text-white/90 hover:bg-white/10 hover:text-white rounded-md border-l-[3px] border-transparent ${
                isActive('/login-history') ? 'active' : ''
              }`}
              data-page="login-history"
            >
              <i className="fas fa-history mr-3"></i>
              <span className="nav-text">Login History</span>
            </Link>
          </li>}
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;
