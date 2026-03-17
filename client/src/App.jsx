import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navigation from './components/Navigation';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';

// Lazy-load pages for faster initial render
const CpuMonitor = lazy(() => import('./pages/CpuMonitor'));
const ClaudeRemoteMonitor = lazy(() => import('./pages/ClaudeRemoteMonitor'));
const RecoveryLogs = lazy(() => import('./pages/RecoveryLogs'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const UsagePage = lazy(() => import('./pages/UsagePage'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full" />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes */}
        <Route path="/*" element={
          <ProtectedRoute>
            <div className="min-h-dvh bg-slate-900 p-2 sm:p-4 md:p-6 pb-20 sm:pb-4 md:pb-6">
              <Navigation />
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Navigate to="/chat" replace />} />
                  <Route path="/cpu" element={<CpuMonitor />} />
                  <Route path="/claude-remote" element={<ClaudeRemoteMonitor />} />
                  <Route path="/logs" element={<RecoveryLogs />} />
                  <Route path="/chat" element={<ChatPage />} />
                  <Route path="/usage" element={<UsagePage />} />
                </Routes>
              </Suspense>
            </div>
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
