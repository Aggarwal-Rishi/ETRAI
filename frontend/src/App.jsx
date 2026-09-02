import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Loader2 } from 'lucide-react';

import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import NewAnalysisPage from './pages/NewAnalysisPage';
import ResultsPage from './pages/ResultsPage';
import HistoryPage from './pages/HistoryPage';
import WorkspacePage from './pages/WorkspacePage';
import AccountSecurityPage from './pages/AccountSecurityPage';
import BillingPage from './pages/BillingPage';
import LatestNewsPage from './pages/LatestNewsPage';
import FakeNewsPage from './pages/FakeNewsPage';
import SettingsPage from './pages/SettingsPage';
import { FEATURE_FLAGS } from './utils/featureFlags';
import AppExperience from './components/AppExperience';

const HomePage = React.lazy(() => import('./pages/HomePage'));

// Protected Route Wrapper
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FFF6E3] flex flex-col items-center justify-center text-[#2C4E86] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#D97757]" />
        <span className="text-sm font-semibold text-[#0B5CD5] font-mono">Verifying Session...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

export default function App() {
  const location = useLocation();
  const isHome = location.pathname === '/';
  return (
    <AuthProvider>
      <AppExperience />
      <div className={`etrai-route-stage ${isHome ? 'etrai-route-stage--home' : 'etrai-route-stage--app'}`}>
        <Routes>
        <Route
          path="/"
          element={
            <React.Suspense fallback={<div className="min-h-screen bg-[#050810]" aria-label="Loading homepage" />}>
              <HomePage />
            </React.Suspense>
          }
        />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        
        {/* Protected Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/news"
          element={
            <ProtectedRoute>
              <LatestNewsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/fake-news"
          element={
            <ProtectedRoute>
              {FEATURE_FLAGS.SHOW_FAKE_NEWS_SECTION ? <FakeNewsPage /> : <Navigate to="/dashboard" replace />}
            </ProtectedRoute>
          }
        />
        <Route
          path="/analysis"
          element={
            <ProtectedRoute>
              <NewAnalysisPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/results/:id"
          element={
            <ProtectedRoute>
              <ResultsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/results"
          element={
            <ProtectedRoute>
              <ResultsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <HistoryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/workspace"
          element={
            <ProtectedRoute>
              <WorkspacePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/security"
          element={
            <ProtectedRoute>
              <AccountSecurityPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing"
          element={
            <ProtectedRoute>
              <BillingPage />
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </div>
    </AuthProvider>
  );
}
