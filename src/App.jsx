import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import Signup from './components/Signup';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import Clients from './pages/Clients';
import ClientInventorySources from './pages/ClientInventorySources';
import Roles from './pages/Roles';
import Inventory from './pages/Inventory';
import InventoryReport from './pages/InventoryReport';
import SalesReport from './pages/SalesReport';
import InventoryDailyCount from './pages/InventoryDailyCount';
import DailySalesCount from './pages/DailySalesCount';
import ScrapRawdataStats from './pages/ScrapRawdataStats';
import NormalizedInventoryScrapStats from './pages/NormalizedInventoryScrapStats';
import HootInventoryStats from './pages/HootInventoryStats';
import UserManagement from './pages/UserManagement';
import AppLoadingScreen from './components/AppLoadingScreen';
import SendgridEventStats from './pages/SendgridEventStats';
import SendgridAutonameEventStats from './pages/SendgridAutonameEventStats';
import LoginHistory from './pages/LoginHistory';
import RouteErrorBoundary from './components/RouteErrorBoundary';
import AdminAccessDenied from './pages/AdminAccessDenied';
import ScraperControl from './pages/ScraperControl';

const PrivateRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <AppLoadingScreen message="Preparing your dashboard…" />;
  }

  return currentUser ? children : <Navigate to="/login" />;
};

const RoleRoute = ({ children, allowViewer = false }) => {
  const { currentUser, loading } = useAuth();
  if (loading) return <AppLoadingScreen message="Verifying access…" />;
  if (!currentUser) return <Navigate to="/login" replace />;

  const role = (currentUser.role || 'viewer').toLowerCase();
  if (role === 'admin') return children;
  if (allowViewer) return children;

  return <Navigate to="/access-denied-admin" replace />;
};

const GuestRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <AppLoadingScreen message="One moment…" />;
  }

  return !currentUser ? children : <Navigate to="/dashboard" replace />;
};

const AdminRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <AppLoadingScreen message="Verifying access…" />;
  }

  if (!currentUser) return <Navigate to="/login" replace />;
  if ((currentUser.role || '').toLowerCase() !== 'admin') return <Navigate to="/access-denied-admin" replace />;
  return children;
};

// Match Vite base (e.g. '/instanintelsupabase/') so routes work on GitHub Pages; no trailing slash for React Router
const routerBasename = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/';

function App() {
  return (
    <AuthProvider>
      <Router basename={routerBasename}>
        <Routes>
          <Route
            path="/login"
            element={
              <GuestRoute>
                <Login />
              </GuestRoute>
            }
          />
          <Route
            path="/signup"
            element={
              <GuestRoute>
                <Signup />
              </GuestRoute>
            }
          />
          <Route
            path="/access-denied-admin"
            element={
              <PrivateRoute>
                <AdminAccessDenied />
              </PrivateRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <RoleRoute allowViewer>
                <Layout>
                  <RouteErrorBoundary>
                    <Dashboard />
                  </RouteErrorBoundary>
                </Layout>
              </RoleRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <RoleRoute>
                <Layout>
                  <Profile />
                </Layout>
              </RoleRoute>
            }
          />
          <Route
            path="/clients"
            element={
              <RoleRoute>
                <Layout>
                  <Clients />
                </Layout>
              </RoleRoute>
            }
          />
          <Route
            path="/client-inventory-sources"
            element={
              <RoleRoute>
                <Layout>
                  <ClientInventorySources />
                </Layout>
              </RoleRoute>
            }
          />
          <Route
            path="/roles"
            element={
              <RoleRoute>
                <Layout>
                  <Roles />
                </Layout>
              </RoleRoute>
            }
          />
          <Route
            path="/inventory"
            element={
              <RoleRoute>
                <Layout>
                  <Inventory />
                </Layout>
              </RoleRoute>
            }
          />
          <Route
            path="/inventory-report"
            element={
              <RoleRoute allowViewer>
                <Layout>
                  <InventoryReport />
                </Layout>
              </RoleRoute>
            }
          />
          <Route
            path="/sales-report"
            element={
              <RoleRoute allowViewer>
                <Layout>
                  <SalesReport />
                </Layout>
              </RoleRoute>
            }
          />
          <Route
            path="/inventory-daily-count"
            element={
              <RoleRoute allowViewer>
                <Layout>
                  <InventoryDailyCount />
                </Layout>
              </RoleRoute>
            }
          />
          <Route
            path="/daily-sales-count"
            element={
              <RoleRoute allowViewer>
                <Layout>
                  <DailySalesCount />
                </Layout>
              </RoleRoute>
            }
          />
          <Route
            path="/scrap-feed-stats"
            element={
              <RoleRoute>
                <Layout>
                  <ScrapRawdataStats />
                </Layout>
              </RoleRoute>
            }
          />
          <Route
            path="/normalized-scrap-stats"
            element={
              <RoleRoute>
                <Layout>
                  <NormalizedInventoryScrapStats />
                </Layout>
              </RoleRoute>
            }
          />
          <Route
            path="/hoot-feed-stats"
            element={
              <RoleRoute>
                <Layout>
                  <HootInventoryStats />
                </Layout>
              </RoleRoute>
            }
          />
          <Route
            path="/sendgrid-event-stats"
            element={
              <RoleRoute>
                <Layout>
                  <SendgridEventStats />
                </Layout>
              </RoleRoute>
            }
          />
          <Route
            path="/sendgrid-autoname-event-stats"
            element={
              <RoleRoute>
                <Layout>
                  <SendgridAutonameEventStats />
                </Layout>
              </RoleRoute>
            }
          />
          <Route
            path="/users"
            element={
              <RoleRoute>
                <Layout>
                  <UserManagement />
                </Layout>
              </RoleRoute>
            }
          />
          <Route
            path="/login-history"
            element={
              <RoleRoute>
                <Layout>
                  <LoginHistory />
                </Layout>
              </RoleRoute>
            }
          />
          <Route
            path="/scraper-control"
            element={
              <RoleRoute>
                <Layout>
                  <ScraperControl />
                </Layout>
              </RoleRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;

