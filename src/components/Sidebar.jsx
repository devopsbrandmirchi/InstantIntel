import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Sidebar = ({ collapsed, onToggle, mobileOpen, onCloseMobile, isDesktop }) => {
  const [reportsMenuOpen, setReportsMenuOpen] = useState(false);
  const location = useLocation();
  const { currentUser } = useAuth();
  const isActive = (path) => location.pathname === path;

  const handleNavClick = () => {
    if (!isDesktop && onCloseMobile) onCloseMobile();
  };

  const navItems = [
    { path: '/dashboard', icon: 'fas fa-tachometer-alt', label: 'Dashboard', page: 'dashboard' },
    { path: '/profile', icon: 'fas fa-user', label: 'User Profile', page: 'profile' },
    { path: '/users', icon: 'fas fa-user-cog', label: 'User Management', page: 'users' },
    { path: '/clients', icon: 'fas fa-users', label: 'Client Master', page: 'clients' },
    { path: '/roles', icon: 'fas fa-user-tag', label: 'Roles', page: 'roles' },
    { path: '/inventory', icon: 'fas fa-boxes', label: 'Inventory', page: 'inventory' },
  ];

  return (
    <div
      className={`sidebar sidebar-themed w-64 flex-shrink-0 transition-all duration-300 ${collapsed && isDesktop ? 'collapsed' : ''} ${!isDesktop && mobileOpen ? 'sidebar-mobile-open' : ''}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="p-4 border-b border-white/10 sidebar-header">
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
      <nav className="mt-4">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                onClick={handleNavClick}
                className={`nav-link flex items-center px-4 py-2 text-white/85 hover:bg-white/10 hover:text-white rounded-md ${
                  isActive(item.path) ? 'active' : ''
                }`}
                data-page={item.page}
              >
                <i className={`${item.icon} mr-3`}></i>
                <span className="nav-text">{item.label}</span>
              </Link>
            </li>
          ))}
          <li>
            <div className="nav-menu-item">
              <button
                onClick={() => setReportsMenuOpen(!reportsMenuOpen)}
                className="nav-link flex items-center justify-between w-full px-4 py-2 text-white/85 hover:bg-white/10 hover:text-white rounded-md"
                id="reportsMenuToggle"
              >
                <div className="flex items-center">
                  <i className="fas fa-chart-bar mr-3"></i>
                  <span className="nav-text">Reports</span>
                </div>
                <i className={`fas fa-chevron-down text-xs nav-chevron ${reportsMenuOpen ? 'rotate-180' : ''}`}></i>
              </button>
              <ul className={`nav-submenu ${reportsMenuOpen ? 'show' : 'hidden'}`} id="reportsSubmenu">
                <li>
                  <Link
                    to="/inventory-report"
                    onClick={handleNavClick}
                    className={`nav-submenu-link flex items-center px-4 py-2 pl-12 text-white/75 hover:bg-white/10 hover:text-white rounded-md ${
                      isActive('/inventory-report') ? 'active' : ''
                    }`}
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
                    className={`nav-submenu-link flex items-center px-4 py-2 pl-12 text-white/75 hover:bg-white/10 hover:text-white rounded-md ${
                      isActive('/sales-report') ? 'active' : ''
                    }`}
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
                    className={`nav-submenu-link flex items-center px-4 py-2 pl-12 text-white/75 hover:bg-white/10 hover:text-white rounded-md ${
                      isActive('/inventory-daily-count') ? 'active' : ''
                    }`}
                    data-page="inventory-daily-count"
                  >
                    <i className="fas fa-list-ol mr-3 text-sm"></i>
                    <span className="nav-text">Daily Inventory Count</span>
                  </Link>
                </li>
                <li>
                  <Link
                    to="/scrap-feed-stats"
                    onClick={handleNavClick}
                    className={`nav-submenu-link flex items-center px-4 py-2 pl-12 text-white/75 hover:bg-white/10 hover:text-white rounded-md ${
                      isActive('/scrap-feed-stats') ? 'active' : ''
                    }`}
                    data-page="scrap-feed-stats"
                  >
                    <i className="fas fa-table mr-3 text-sm"></i>
                    <span className="nav-text">Scrap feed stats</span>
                  </Link>
                </li>
              </ul>
            </div>
          </li>
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;

