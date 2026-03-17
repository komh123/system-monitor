import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navigation from './components/Navigation';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import CpuMonitor from './pages/CpuMonitor';
import ClaudeRemoteMonitor from './pages/ClaudeRemoteMonitor';
import RecoveryLogs from './pages/RecoveryLogs';
import ChatPage from './pages/ChatPage';
import UsagePage from './pages/UsagePage';

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
              <Routes>
                <Route path="/" element={<Navigate to="/chat" replace />} />
                <Route path="/cpu" element={<CpuMonitor />} />
                <Route path="/claude-remote" element={<ClaudeRemoteMonitor />} />
                <Route path="/logs" element={<RecoveryLogs />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/usage" element={<UsagePage />} />
              </Routes>
            </div>
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
