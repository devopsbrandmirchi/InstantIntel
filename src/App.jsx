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
import ScrapRawdataStats from './pages/ScrapRawdataStats';
import NormalizedInventoryScrapStats from './pages/NormalizedInventoryScrapStats';
import UserManagement from './pages/UserManagement';
import AppLoadingScreen from './components/AppLoadingScreen';
import SendgridEventStats from './pages/SendgridEventStats';
import LoginHistory from './pages/LoginHistory';

const PrivateRoute = ({ children }) => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <AppLoadingScreen message="Preparing your dashboard…" />;
  }

  return currentUser ? children : <Navigate to="/login" />;
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
  if ((currentUser.role || '').toLowerCase() !== 'admin') return <Navigate to="/dashboard" replace />;
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
            path="/dashboard"
            element={
              <PrivateRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <PrivateRoute>
                <Layout>
                  <Profile />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/clients"
            element={
              <PrivateRoute>
                <Layout>
                  <Clients />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/client-inventory-sources"
            element={
              <PrivateRoute>
                <Layout>
                  <ClientInventorySources />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/roles"
            element={
              <PrivateRoute>
                <Layout>
                  <Roles />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/inventory"
            element={
              <PrivateRoute>
                <Layout>
                  <Inventory />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/inventory-report"
            element={
              <PrivateRoute>
                <Layout>
                  <InventoryReport />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/sales-report"
            element={
              <PrivateRoute>
                <Layout>
                  <SalesReport />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/inventory-daily-count"
            element={
              <PrivateRoute>
                <Layout>
                  <InventoryDailyCount />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/scrap-feed-stats"
            element={
              <PrivateRoute>
                <Layout>
                  <ScrapRawdataStats />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/normalized-scrap-stats"
            element={
              <PrivateRoute>
                <Layout>
                  <NormalizedInventoryScrapStats />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/sendgrid-event-stats"
            element={
              <PrivateRoute>
                <Layout>
                  <SendgridEventStats />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/users"
            element={
              <PrivateRoute>
                <Layout>
                  <UserManagement />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route
            path="/login-history"
            element={
              <PrivateRoute>
                <Layout>
                  <LoginHistory />
                </Layout>
              </PrivateRoute>
            }
          />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;

